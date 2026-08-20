//! 10-полосный параметрический эквалайзер поверх peaking-биквадов
//! (`biquad` крейт), вставляется между `Decoder` и выводом как обычный
//! rodio `Source`/`Iterator`. Гейны и вкл/выкл живут в `EqState`, общем на
//! всё приложение — переживают смену трека, `audio::spawn` и
//! `audio_set_eq` держат один и тот же `Arc`.
//!
//! На каждый новый трек создаётся новый `EqSource` (свежие биквады с нулевым
//! внутренним состоянием) — это осознанно: тащить delay line фильтра из
//! одного трека в другой не нужно, слышимой разницы нет, а на сике внутри
//! одного трека состояние сбрасывается явно (см. `try_seek`).

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;

use biquad::{Biquad, Coefficients, DirectForm1, ToHertz, Type};
use rodio::source::SeekError;
use rodio::{ChannelCount, SampleRate, Source};
use tauri::State;

pub const BAND_COUNT: usize = 10;
pub const BAND_FREQUENCIES_HZ: [f32; BAND_COUNT] =
    [32.0, 64.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0];

/// Добротность полосы — подобрана так, чтобы 10 полос на этих частотах
/// прилично перекрывали слышимый диапазон без явных провалов/горбов между
/// соседними полосами.
const Q: f32 = 1.0;

pub struct EqState {
    enabled: AtomicBool,
    gains_db: [AtomicU32; BAND_COUNT],
}

impl EqState {
    pub fn new() -> Self {
        Self {
            enabled: AtomicBool::new(false),
            gains_db: std::array::from_fn(|_| AtomicU32::new(0f32.to_bits())),
        }
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled.load(Ordering::Relaxed)
    }

    pub fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::Relaxed);
    }

    pub fn gains(&self) -> [f32; BAND_COUNT] {
        std::array::from_fn(|i| f32::from_bits(self.gains_db[i].load(Ordering::Relaxed)))
    }

    pub fn set_gains(&self, gains: [f32; BAND_COUNT]) {
        for (slot, gain) in self.gains_db.iter().zip(gains) {
            slot.store(gain.to_bits(), Ordering::Relaxed);
        }
    }
}

impl Default for EqState {
    fn default() -> Self {
        Self::new()
    }
}

fn build_filters(
    sample_rate: SampleRate,
    gains: [f32; BAND_COUNT],
) -> [DirectForm1<f32>; BAND_COUNT] {
    std::array::from_fn(|i| {
        let coeffs = peaking_coeffs(sample_rate, i, gains[i]);
        DirectForm1::<f32>::new(coeffs)
    })
}

fn peaking_coeffs(sample_rate: SampleRate, band: usize, gain_db: f32) -> Coefficients<f32> {
    Coefficients::<f32>::from_params(
        Type::PeakingEQ(gain_db),
        (sample_rate.get() as f32).hz(),
        BAND_FREQUENCIES_HZ[band].hz(),
        Q,
    )
    // На вырожденной частоте дискретизации (не должно случаться для реальных
    // MP3, но лучше тихий passthrough, чем паника посреди трека) —
    // коэффициенты нулевого фильтра: b0=1, всё остальное 0.
    .unwrap_or(Coefficients {
        a1: 0.0,
        a2: 0.0,
        b0: 1.0,
        b1: 0.0,
        b2: 0.0,
    })
}

/// Оборачивает источник сэмплов `S` цепочкой из `BAND_COUNT` каскадных
/// peaking-биквадов на каждый канал (интерливинг каналов rodio — свой набор
/// фильтров на каждый, иначе левый/правый канал влияли бы друг на друга).
pub struct EqSource<S> {
    inner: S,
    state: Arc<EqState>,
    channels: ChannelCount,
    sample_rate: SampleRate,
    filters: Vec<[DirectForm1<f32>; BAND_COUNT]>,
    current_channel: usize,
    applied_gains: [f32; BAND_COUNT],
}

impl<S> EqSource<S>
where
    S: Source<Item = f32>,
{
    pub fn new(inner: S, state: Arc<EqState>) -> Self {
        let channels = inner.channels();
        let sample_rate = inner.sample_rate();
        let gains = state.gains();
        let filters = (0..channels.get())
            .map(|_| build_filters(sample_rate, gains))
            .collect();
        Self {
            inner,
            state,
            channels,
            sample_rate,
            filters,
            current_channel: 0,
            applied_gains: gains,
        }
    }

    fn refresh_coefficients_if_changed(&mut self) {
        let latest = self.state.gains();
        if latest == self.applied_gains {
            return;
        }
        for channel_filters in &mut self.filters {
            for (band, filter) in channel_filters.iter_mut().enumerate() {
                filter.update_coefficients(peaking_coeffs(self.sample_rate, band, latest[band]));
            }
        }
        self.applied_gains = latest;
    }

    fn reset_filter_state(&mut self) {
        for channel_filters in &mut self.filters {
            for filter in channel_filters.iter_mut() {
                filter.reset_state();
            }
        }
    }
}

impl<S> Iterator for EqSource<S>
where
    S: Source<Item = f32>,
{
    type Item = f32;

    fn next(&mut self) -> Option<f32> {
        let sample = self.inner.next()?;

        if !self.state.is_enabled() {
            self.current_channel = (self.current_channel + 1) % self.channels.get() as usize;
            return Some(sample);
        }

        // Проверяем изменение гейнов раз в кадр (на первом канале), а не на
        // каждый сэмпл — дешевле, разница неощутима на слух.
        if self.current_channel == 0 {
            self.refresh_coefficients_if_changed();
        }

        let channel_filters = &mut self.filters[self.current_channel];
        let mut processed = sample;
        for filter in channel_filters.iter_mut() {
            processed = filter.run(processed);
        }

        self.current_channel = (self.current_channel + 1) % self.channels.get() as usize;
        Some(processed)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.inner.size_hint()
    }
}

impl<S> Source for EqSource<S>
where
    S: Source<Item = f32>,
{
    fn current_span_len(&self) -> Option<usize> {
        self.inner.current_span_len()
    }

    fn channels(&self) -> ChannelCount {
        self.channels
    }

    fn sample_rate(&self) -> SampleRate {
        self.sample_rate
    }

    fn total_duration(&self) -> Option<Duration> {
        self.inner.total_duration()
    }

    // `Source::try_seek` по умолчанию отдаёт `Err(NotSupported)` — без этой
    // явной делегации обёртка эквалайзера молча сломала бы всю перемотку,
    // включая только что исправленный баг с перемоткой назад (см. план,
    // шаг про Decoder::try_from). После успешного сика сбрасываем delay
    // line фильтров — иначе на стыке слышен короткий щелчок от "памяти"
    // фильтра о случайном месте трека, из которого мы только что прыгнули.
    fn try_seek(&mut self, pos: Duration) -> Result<(), SeekError> {
        let result = self.inner.try_seek(pos);
        if result.is_ok() {
            self.reset_filter_state();
        }
        result
    }
}

#[tauri::command]
pub fn audio_set_eq(enabled: bool, gains: Vec<f64>, eq: State<'_, Arc<EqState>>) -> Result<(), String> {
    if gains.len() != BAND_COUNT {
        return Err(format!(
            "ожидалось {BAND_COUNT} полос эквалайзера, получено {}",
            gains.len()
        ));
    }
    let gains_f32: [f32; BAND_COUNT] = std::array::from_fn(|i| gains[i] as f32);
    eq.set_gains(gains_f32);
    eq.set_enabled(enabled);
    Ok(())
}

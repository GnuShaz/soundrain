//! Rust владеет звуком, React владеет очередью: этот модуль знает только про
//! "загрузить файл / играть / пауза / перемотка", ничего про SoundCloud или
//! плейлисты. `rodio` 0.22 требует, чтобы `Player`/`MixerDeviceSink` жили на
//! одном потоке (недра — не `Send`), поэтому вся работа со звуком — на
//! выделенном std-потоке с общением через каналы, а не в managed-состоянии
//! Tauri напрямую.
//!
//! Файлы треков не выбрасываются после проигрывания — см. [`crate::cache`]:
//! персистентный дисковый кэш по id трека, чтобы повтор/prefetch не ждали
//! сеть заново.

use std::io::Write;
use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::Arc;
use std::time::Duration;

use rodio::{Decoder, Player};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::oneshot;

use crate::cache::AudioCache;
use crate::eq::{EqSource, EqState};
use crate::network::NetworkConfig;

const TICK_INTERVAL: Duration = Duration::from_millis(100);

enum AudioCmd {
    LoadFile {
        path: PathBuf,
        reply: oneshot::Sender<Result<(), String>>,
    },
    Play,
    Pause,
    Stop,
    Seek(f64),
    SetVolume(f64),
    /// `None` — вернуться на системное устройство по умолчанию.
    SetDevice(Option<String>),
}

pub struct AudioHandle {
    tx: Sender<AudioCmd>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AudioTick {
    position_secs: f64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevice {
    /// Имя устройства как id — у `cpal` нет стабильного числового идентификатора,
    /// имя достаточно уникально для списка вывода одной машины (см. настройки, пункт 17).
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

fn build_sink_device(device_id: Option<&str>) -> Result<rodio::stream::MixerDeviceSink, String> {
    use rodio::cpal::traits::HostTrait;

    if let Some(device_id) = device_id {
        let host = rodio::cpal::default_host();
        // `DeviceId` (не имя) — переживает переименование устройства
        // драйвером между запусками, в отличие от `name()` (deprecated
        // в пользу `id()`/`description()` именно из-за этого).
        let device = device_id
            .parse::<rodio::cpal::DeviceId>()
            .ok()
            .and_then(|id| host.device_by_id(&id));
        if let Some(device) = device {
            return rodio::DeviceSinkBuilder::from_device(device)
                .map_err(|e| e.to_string())?
                .open_stream()
                .map_err(|e| e.to_string());
        }
        // Устройство отключено с прошлого запуска — тихо откатываемся на
        // системное по умолчанию, а не роняем поток звука целиком.
    }
    rodio::DeviceSinkBuilder::open_default_sink().map_err(|e| e.to_string())
}

pub fn spawn(app: AppHandle, eq_state: Arc<EqState>) -> AudioHandle {
    let (tx, rx) = mpsc::channel::<AudioCmd>();
    std::thread::spawn(move || audio_thread(app, rx, eq_state));
    AudioHandle { tx }
}

fn audio_thread(app: AppHandle, rx: Receiver<AudioCmd>, eq_state: Arc<EqState>) {
    let mut sink_device = match rodio::DeviceSinkBuilder::open_default_sink() {
        Ok(s) => s,
        Err(e) => {
            let _ = app.emit("audio:state", format!("устройство вывода недоступно: {e}"));
            return;
        }
    };

    let mut player: Option<Player> = None;
    // Путь текущего файла — нужен, чтобы при переключении устройства
    // (`SetDevice`) пересоздать `Player` на новом `Mixer` с той же позиции,
    // а не оборвать воспроизведение.
    let mut current_path: Option<PathBuf> = None;

    loop {
        match rx.recv_timeout(TICK_INTERVAL) {
            // Файл — запись персистентного кэша (см. resolve_cached_path),
            // поэтому в отличие от старой версии не удаляем его ни при
            // переключении на следующий трек, ни при выходе из потока —
            // это забота AudioCache::evict.
            Ok(AudioCmd::LoadFile { path, reply }) => {
                player = None;

                // `Decoder::try_from(File)` (не `Decoder::new(BufReader::new(file))`)
                // — выставляет Symphonia `byte_len`/`seekable(true)`, без этого
                // `try_seek` назад падает с `RandomAccessNotSupported` (вперёд
                // при этом работает — асимметрия и маскировала баг: казалось,
                // что дело в UI/гонке с тиком, а перемотка назад была физически
                // невозможна на уровне декодера).
                let loaded = std::fs::File::open(&path)
                    .map_err(|e| e.to_string())
                    .and_then(|file| Decoder::try_from(file).map_err(|e| e.to_string()))
                    .map(|decoder| {
                        let p = Player::connect_new(sink_device.mixer());
                        p.pause();
                        p.append(EqSource::new(decoder, eq_state.clone()));
                        p
                    });

                match loaded {
                    Ok(p) => {
                        player = Some(p);
                        current_path = Some(path);
                        let _ = reply.send(Ok(()));
                    }
                    Err(e) => {
                        // Файл в кэше битый — удаляем, чтобы следующая
                        // попытка перекачала его заново, а не падала так же.
                        let _ = std::fs::remove_file(&path);
                        let _ = reply.send(Err(e));
                    }
                }
            }
            Ok(AudioCmd::Play) => {
                if let Some(p) = &player {
                    p.play();
                }
            }
            Ok(AudioCmd::Pause) => {
                if let Some(p) = &player {
                    p.pause();
                }
            }
            Ok(AudioCmd::Stop) => {
                player = None;
                current_path = None;
            }
            Ok(AudioCmd::Seek(secs)) => {
                if let Some(p) = &player {
                    let _ = p.try_seek(Duration::from_secs_f64(secs.max(0.0)));
                }
            }
            Ok(AudioCmd::SetVolume(v)) => {
                if let Some(p) = &player {
                    p.set_volume(v.clamp(0.0, 1.0) as f32);
                }
            }
            Ok(AudioCmd::SetDevice(device_name)) => {
                match build_sink_device(device_name.as_deref()) {
                    Ok(new_sink) => {
                        let resume_at = player.as_ref().map(|p| p.get_pos());
                        let was_playing = player.as_ref().is_some_and(|p| !p.is_paused());
                        player = None;
                        sink_device = new_sink;

                        if let (Some(path), Some(pos)) = (&current_path, resume_at) {
                            if let Ok(file) = std::fs::File::open(path) {
                                if let Ok(decoder) = Decoder::try_from(file) {
                                    let p = Player::connect_new(sink_device.mixer());
                                    p.pause();
                                    p.append(EqSource::new(decoder, eq_state.clone()));
                                    let _ = p.try_seek(pos);
                                    if was_playing {
                                        p.play();
                                    }
                                    player = Some(p);
                                }
                            }
                        }
                    }
                    Err(e) => eprintln!("не удалось переключить устройство вывода: {e}"),
                }
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => break,
        }

        if let Some(p) = &player {
            if p.empty() {
                let _ = app.emit("audio:ended", ());
                player = None;
            } else if !p.is_paused() {
                let _ = app.emit(
                    "audio:tick",
                    AudioTick {
                        position_secs: p.get_pos().as_secs_f64(),
                    },
                );
            }
        }
    }
}

/// Кэш-хит — путь отдаётся сразу, без сети. Иначе скачивает во временный
/// файл рядом с кэшем и атомарно переименовывает в финальное имя (`rename`
/// в пределах одной ФС атомарен) — так конкурентная докачка того же трека
/// (обычный play плюс фоновый prefetch) не читает половину файла.
async fn resolve_cached_path(
    track_id: i64,
    url: &str,
    cache: &AudioCache,
    network: &NetworkConfig,
) -> Result<PathBuf, String> {
    if let Some(path) = cache.get(track_id) {
        return Ok(path);
    }

    let resp = network
        .client()
        .get(url)
        .send()
        .await
        .map_err(|e| format!("не удалось скачать трек: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("SoundCloud CDN ответил {}", resp.status()));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("не удалось скачать трек: {e}"))?;

    let dir = cache.dir().to_path_buf();
    let final_path = cache.path_for(track_id);
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let mut tmp = tempfile::NamedTempFile::new_in(&dir).map_err(|e| e.to_string())?;
        tmp.write_all(&bytes).map_err(|e| e.to_string())?;
        tmp.persist(&final_path).map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())??;

    cache.evict();
    Ok(cache.path_for(track_id))
}

#[tauri::command]
pub async fn audio_load_url(
    track_id: i64,
    url: String,
    audio: State<'_, AudioHandle>,
    cache: State<'_, AudioCache>,
    network: State<'_, std::sync::Arc<NetworkConfig>>,
) -> Result<(), String> {
    let path = resolve_cached_path(track_id, &url, &cache, &network).await?;
    let (reply_tx, reply_rx) = oneshot::channel();
    audio
        .tx
        .send(AudioCmd::LoadFile {
            path,
            reply: reply_tx,
        })
        .map_err(|_| "аудио-поток недоступен".to_string())?;
    reply_rx
        .await
        .map_err(|_| "аудио-поток не ответил".to_string())?
}

/// Фоновая докачка в кэш без касания текущего воспроизведения — используется
/// для prefetch следующего трека в очереди, пока играет текущий.
#[tauri::command]
pub async fn audio_prefetch(
    track_id: i64,
    url: String,
    cache: State<'_, AudioCache>,
    network: State<'_, std::sync::Arc<NetworkConfig>>,
) -> Result<(), String> {
    resolve_cached_path(track_id, &url, &cache, &network).await?;
    Ok(())
}

#[tauri::command]
pub fn audio_play(audio: State<'_, AudioHandle>) {
    let _ = audio.tx.send(AudioCmd::Play);
}

#[tauri::command]
pub fn audio_pause(audio: State<'_, AudioHandle>) {
    let _ = audio.tx.send(AudioCmd::Pause);
}

#[tauri::command]
pub fn audio_stop(audio: State<'_, AudioHandle>) {
    let _ = audio.tx.send(AudioCmd::Stop);
}

#[tauri::command]
pub fn audio_seek(position_secs: f64, audio: State<'_, AudioHandle>) {
    let _ = audio.tx.send(AudioCmd::Seek(position_secs));
}

#[tauri::command]
pub fn audio_set_volume(volume: f64, audio: State<'_, AudioHandle>) {
    let _ = audio.tx.send(AudioCmd::SetVolume(volume));
}

#[tauri::command]
pub fn audio_list_devices() -> Result<Vec<AudioDevice>, String> {
    use rodio::cpal::traits::{DeviceTrait, HostTrait};

    let host = rodio::cpal::default_host();
    let default_id = host.default_output_device().and_then(|d| d.id().ok());

    let devices = host
        .output_devices()
        .map_err(|e| e.to_string())?
        .filter_map(|d| Some((d.id().ok()?, d.description().ok()?)))
        .map(|(id, description)| AudioDevice {
            is_default: Some(&id) == default_id.as_ref(),
            id: id.to_string(),
            name: description.name().to_string(),
        })
        .collect();
    Ok(devices)
}

/// `None` — вернуться на системное устройство по умолчанию.
#[tauri::command]
pub fn audio_set_device(device_id: Option<String>, audio: State<'_, AudioHandle>) {
    let _ = audio.tx.send(AudioCmd::SetDevice(device_id));
}

/// Диагностика бага "перемотка назад визуально откатывается, звук не
/// перематывается" — напрямую дёргает `Player::try_seek`, минуя очередь
/// команд/фронтенд, чтобы увидеть реальный `Result` (в проде он молча
/// отбрасывается через `let _ = ...`) и реальную позицию до/после.
///
/// Запуск: `cargo test --lib audio::tests::probe_seek -- --ignored --nocapture`
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore]
    fn probe_seek() {
        let sink_device =
            rodio::DeviceSinkBuilder::open_default_sink().expect("нет устройства вывода");

        let cache_dir = dirs_next_cache_dir();
        let entry = std::fs::read_dir(&cache_dir)
            .expect("нет кэша — сначала проиграйте хотя бы один трек в настоящем приложении")
            .filter_map(|e| e.ok())
            .find(|e| e.path().extension().is_some_and(|ext| ext == "mp3"))
            .expect("в кэше нет ни одного .mp3");
        let path = entry.path();
        println!("probe file: {path:?}");

        let file = std::fs::File::open(&path).unwrap();
        let decoder = Decoder::try_from(file).expect("не удалось декодировать файл");
        let player = Player::connect_new(sink_device.mixer());
        player.append(decoder);
        player.play();

        std::thread::sleep(Duration::from_millis(500));
        let before = player.get_pos();
        println!("position before seek: {before:?}");

        let forward_target = before + Duration::from_secs(20);
        let forward_result = player.try_seek(forward_target);
        std::thread::sleep(Duration::from_millis(200));
        println!(
            "seek forward to {forward_target:?} -> {forward_result:?}, position after: {:?}",
            player.get_pos()
        );

        let backward_target = Duration::from_secs(5);
        let backward_result = player.try_seek(backward_target);
        std::thread::sleep(Duration::from_millis(200));
        println!(
            "seek backward to {backward_target:?} -> {backward_result:?}, position after: {:?}",
            player.get_pos()
        );

        assert!(forward_result.is_ok(), "seek forward failed: {forward_result:?}");
        assert!(
            backward_result.is_ok(),
            "seek backward failed: {backward_result:?}"
        );
    }

    fn dirs_next_cache_dir() -> PathBuf {
        // Тот же путь, что и AudioCache в проде (app_cache_dir()/audio), но
        // без поднятия целого Tauri App — просто известный путь на Windows
        // для этого конкретного identifier.
        PathBuf::from(std::env::var("LOCALAPPDATA").expect("LOCALAPPDATA не задан"))
            .join("com.soundrain.desktop")
            .join("audio")
    }
}

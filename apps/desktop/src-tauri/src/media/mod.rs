//! Системная интеграция: SMTC на Windows / MPRIS на Linux / MPRemoteCommandCenter
//! на macOS — через `souvlaki`. Тот же принцип, что и у `audio::tick`/`ended`:
//! события нажатия медиа-клавиш просто транслируются в React как
//! `media:play`/`pause`/`toggle`/`next`/`prev` — Rust не решает сам, что
//! дальше играть, этим занимается очередь во фронтенде.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use souvlaki::{
    MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition,
    PlatformConfig, SeekDirection,
};
use tauri::{AppHandle, Emitter, Manager, State};

pub struct MediaHandle {
    controls: Mutex<MediaControls>,
    /// Последний снимок + момент, когда он был записан. `position_secs` в
    /// нём — НЕ живая позиция, а позиция на момент последнего `media_update`
    /// (фронт шлёт его только при смене трека/статуса play↔pause, не на
    /// каждый тик — иначе 10 IPC-вызовов в секунду, см. `wire-media-events.ts`).
    /// Баг, найденный пользователем на реальном OBS-виджете: без досчёта
    /// позиция была бы заморожена на весь трек между такими событиями —
    /// `snapshot()` досчитывает её по системным часам, пока `playing`.
    last: Mutex<Option<(NowPlaying, Instant)>>,
}

impl MediaHandle {
    /// Тот же снимок, что уходит фронту (`media_get_snapshot`) — но
    /// вызывается напрямую из потока OBS-виджета (`widget/mod.rs`), который
    /// живёт вне очереди команд Tauri, поэтому не может дёрнуть команду
    /// как обычный `invoke`.
    pub fn snapshot(&self) -> Option<NowPlaying> {
        let guard = self.last.lock().ok()?;
        let (now_playing, recorded_at) = guard.as_ref()?;
        let mut result = now_playing.clone();
        if result.playing {
            let elapsed = recorded_at.elapsed().as_secs_f64();
            result.position_secs = (result.position_secs + elapsed).min(result.duration_secs.max(0.0));
        }
        Some(result)
    }
}

pub fn init(app: &AppHandle) -> Result<MediaHandle, String> {
    #[cfg(target_os = "windows")]
    let hwnd: Option<*mut std::ffi::c_void> = {
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| "нет главного окна для медиа-контролов".to_string())?;
        let raw = window.hwnd().map_err(|e| e.to_string())?;
        Some(raw.0 as *mut std::ffi::c_void)
    };
    #[cfg(not(target_os = "windows"))]
    let hwnd: Option<*mut std::ffi::c_void> = None;

    let config = PlatformConfig {
        dbus_name: "soundrain",
        display_name: "SoundRain",
        hwnd,
    };

    let mut controls = MediaControls::new(config).map_err(|e| format!("{e:?}"))?;

    let app_handle = app.clone();
    controls
        .attach(move |event: MediaControlEvent| {
            let name = match event {
                MediaControlEvent::Play => "media:play",
                MediaControlEvent::Pause => "media:pause",
                MediaControlEvent::Toggle => "media:toggle",
                MediaControlEvent::Next => "media:next",
                MediaControlEvent::Previous => "media:prev",
                MediaControlEvent::Seek(SeekDirection::Forward) => "media:seek-forward",
                MediaControlEvent::Seek(SeekDirection::Backward) => "media:seek-backward",
                _ => return,
            };
            let _ = app_handle.emit(name, ());
        })
        .map_err(|e| format!("{e:?}"))?;

    Ok(MediaHandle {
        controls: Mutex::new(controls),
        last: Mutex::new(None),
    })
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NowPlaying {
    pub title: String,
    pub artist: String,
    pub cover_url: Option<String>,
    pub duration_secs: f64,
    pub position_secs: f64,
    pub playing: bool,
}

#[tauri::command]
pub fn media_update(
    payload: NowPlaying,
    app: AppHandle,
    media: State<'_, MediaHandle>,
) -> Result<(), String> {
    let mut controls = media
        .controls
        .lock()
        .map_err(|_| "медиа-контролы недоступны".to_string())?;

    controls
        .set_metadata(MediaMetadata {
            title: Some(&payload.title),
            artist: Some(&payload.artist),
            album: None,
            cover_url: payload.cover_url.as_deref(),
            duration: Some(Duration::from_secs_f64(payload.duration_secs.max(0.0))),
        })
        .map_err(|e| format!("{e:?}"))?;

    let progress = Some(MediaPosition(Duration::from_secs_f64(
        payload.position_secs.max(0.0),
    )));
    let playback = if payload.playing {
        MediaPlayback::Playing { progress }
    } else {
        MediaPlayback::Paused { progress }
    };
    controls
        .set_playback(playback)
        .map_err(|e| format!("{e:?}"))?;

    *media
        .last
        .lock()
        .map_err(|_| "медиа-контролы недоступны".to_string())? =
        Some((payload.clone(), Instant::now()));
    let _ = app.emit("media:now-playing", Some(payload));
    Ok(())
}

#[tauri::command]
pub fn media_clear(app: AppHandle, media: State<'_, MediaHandle>) -> Result<(), String> {
    let mut controls = media
        .controls
        .lock()
        .map_err(|_| "медиа-контролы недоступны".to_string())?;
    controls
        .set_playback(MediaPlayback::Stopped)
        .map_err(|e| format!("{e:?}"))?;

    *media
        .last
        .lock()
        .map_err(|_| "медиа-контролы недоступны".to_string())? = None;
    let _ = app.emit("media:now-playing", Option::<NowPlaying>::None);
    Ok(())
}

#[tauri::command]
pub fn media_get_snapshot(media: State<'_, MediaHandle>) -> Result<Option<NowPlaying>, String> {
    Ok(media.snapshot())
}

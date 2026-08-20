mod audio;
mod auth;
mod background;
mod cache;
mod discord;
mod eq;
mod media;
mod miniplayer;
mod network;
mod soundcloud;
mod tray;
mod widget;
mod zapret;

use cache::AudioCache;
use eq::EqState;
use network::NetworkConfig;
use soundcloud::ScClient;
use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let network = Arc::new(NetworkConfig::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(ScClient::new(network.clone()))
        .manage(network)
        .setup(|app| {
            let cache_dir = app
                .path()
                .app_cache_dir()
                .map_err(|e| e.to_string())?
                .join("audio");
            app.manage(AudioCache::new(cache_dir));
            app.manage(widget::WidgetServer::new());

            let eq_state = Arc::new(EqState::new());
            app.manage(eq_state.clone());

            let audio_handle = audio::spawn(app.handle().clone(), eq_state);
            app.manage(audio_handle);
            match media::init(app.handle()) {
                Ok(media_handle) => {
                    app.manage(media_handle);
                }
                Err(e) => eprintln!("медиа-контролы ОС недоступны: {e}"),
            }

            app.manage(discord::spawn());

            if let Err(e) = tray::init(app.handle()) {
                eprintln!("не удалось создать иконку в трее: {e}");
            }

            // Крестик у главного окна сворачивает в трей, а не завершает
            // процесс — выйти можно только через пункт "Quit" в трее.
            if let Some(main_window) = app.get_webview_window("main") {
                let window_to_hide = main_window.clone();
                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_to_hide.hide();
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            auth::auth_status,
            auth::auth_set_token,
            auth::auth_start_oauth_login,
            auth::auth_logout,
            soundcloud::sc_stream,
            soundcloud::sc_likes,
            soundcloud::sc_track_stream,
            soundcloud::sc_search_tracks,
            soundcloud::sc_search_playlists,
            soundcloud::sc_user_profile,
            soundcloud::sc_user_tracks,
            soundcloud::sc_user_playlists,
            soundcloud::sc_like,
            soundcloud::sc_unlike,
            soundcloud::sc_home_feed,
            soundcloud::sc_resolve_tracks,
            soundcloud::sc_playlist_track_ids,
            audio::audio_load_url,
            audio::audio_prefetch,
            audio::audio_play,
            audio::audio_pause,
            audio::audio_stop,
            audio::audio_seek,
            audio::audio_set_volume,
            audio::audio_list_devices,
            audio::audio_set_device,
            eq::audio_set_eq,
            media::media_update,
            media::media_clear,
            media::media_get_snapshot,
            cache::cache_get_stats,
            cache::cache_clear_audio,
            cache::cache_set_audio_limit,
            background::background_get,
            background::background_set,
            background::background_clear,
            network::network_set_proxy,
            network::network_check,
            zapret::zapret_add_soundcloud_domains,
            widget::widget_get_status,
            widget::widget_set_enabled,
            widget::widget_set_port,
            discord::discord_set_enabled,
            discord::discord_update_presence,
            discord::discord_clear_presence,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

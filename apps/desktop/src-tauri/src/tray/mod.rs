//! Иконка в трее + меню (`tray.png` в корне репо). Play/Pause/Previous/Next
//! не исполняются сами — эмитят те же `media:*` события, что и системные
//! медиа-клавиши (`media::init`), их слушает `wireMediaEvents` во фронте:
//! очередь по-прежнему знает только фронтенд, Rust её не дублирует.

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

pub fn init(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Показать", true, None::<&str>)?;
    let mini_player = MenuItem::with_id(app, "mini_player", "Мини-плеер", true, None::<&str>)?;
    let play_pause = MenuItem::with_id(app, "play_pause", "Play / Pause", true, None::<&str>)?;
    let previous = MenuItem::with_id(app, "previous", "Previous", true, None::<&str>)?;
    let next = MenuItem::with_id(app, "next", "Next", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&show, &mini_player, &play_pause, &previous, &next, &quit],
    )?;

    let mut builder = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "mini_player" => {
                if let Err(e) = crate::miniplayer::open(app) {
                    eprintln!("не удалось открыть мини-плеер: {e}");
                }
            }
            "play_pause" => {
                let _ = app.emit("media:toggle", ());
            }
            "previous" => {
                let _ = app.emit("media:prev", ());
            }
            "next" => {
                let _ = app.emit("media:next", ());
            }
            "quit" => app.exit(0),
            _ => {}
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    Ok(())
}

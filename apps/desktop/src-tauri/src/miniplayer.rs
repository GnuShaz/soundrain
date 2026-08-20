//! Отдельное компактное окно — тот же фронтенд-бандл, что и главное окно;
//! какой UI рендерить, решает сам React по `getCurrentWindow().label`
//! (см. `main.tsx`). Своего состояния очереди в Rust не заводим — окно
//! просто ещё один слушатель `media:now-playing`/эмиттер `media:*`.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const LABEL: &str = "mini-player";

pub fn open(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(LABEL) {
        window.show()?;
        window.set_focus()?;
        return Ok(());
    }

    // `.build()` дедлокается на Windows, если вызван синхронно из
    // обработчика события/команды (см. doc-комментарий
    // `WebviewWindowBuilder::new` в tauri 2.11) — здесь это как раз
    // обработчик клика по пункту меню трея, поэтому строим в отдельном потоке.
    let app = app.clone();
    std::thread::spawn(move || {
        let result = WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::App("index.html".into()))
            .title("SoundRain")
            .inner_size(320.0, 96.0)
            .resizable(false)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .build();
        if let Err(e) = result {
            eprintln!("не удалось создать окно мини-плеера: {e}");
        }
    });
    Ok(())
}

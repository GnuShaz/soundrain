//! Фоновая картинка приложения (настройки, группа «Фон», план пункт 15).
//! Исходный файл копируется в app-data под фиксированным именем — не
//! полагаемся на то, что пользователь не переместит/не удалит оригинал.
//! Фронту отдаём готовый `data:` URI (не `asset://`-путь): один файл, читаем
//! редко (при старте и при смене), избыточность base64 не имеет значения, а
//! так не нужно возиться со scope'ом asset-протокола в `tauri.conf.json`.

use base64::Engine;
use tauri::{AppHandle, Manager};

const EXTENSIONS: [&str; 5] = ["png", "jpg", "jpeg", "webp", "gif"];

fn background_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

fn find_existing(app: &AppHandle) -> Option<std::path::PathBuf> {
    let dir = background_dir(app).ok()?;
    EXTENSIONS
        .iter()
        .map(|ext| dir.join(format!("background.{ext}")))
        .find(|p| p.exists())
}

fn mime_for(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/png",
    }
}

fn to_data_uri(path: &std::path::Path) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("png");
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:{};base64,{encoded}", mime_for(ext)))
}

#[tauri::command]
pub fn background_get(app: AppHandle) -> Option<String> {
    let path = find_existing(&app)?;
    to_data_uri(&path).ok()
}

#[tauri::command]
pub fn background_set(app: AppHandle, source_path: String) -> Result<String, String> {
    let dir = background_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    // Держим ровно один файл фона — предыдущий (любого расширения) убираем
    // перед копированием нового.
    if let Some(old) = find_existing(&app) {
        let _ = std::fs::remove_file(old);
    }

    let source = std::path::PathBuf::from(&source_path);
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .filter(|e| EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or("png");
    let dest = dir.join(format!("background.{ext}"));
    std::fs::copy(&source, &dest).map_err(|e| format!("не удалось скопировать файл: {e}"))?;

    to_data_uri(&dest)
}

#[tauri::command]
pub fn background_clear(app: AppHandle) {
    if let Some(existing) = find_existing(&app) {
        let _ = std::fs::remove_file(existing);
    }
}

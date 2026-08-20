//! Токен никогда не покидает Rust: фронт получает только [`AuthStatus`]
//! (флаг + публичный профиль), а сам `oauth_token` хранится в системном
//! хранилище учётных данных (Windows Credential Manager / Keychain /
//! Secret Service), не в файле на диске.
//!
//! На Windows — свой минимальный слой поверх Win32 (см. [`windows_credential`]),
//! а не крейт `keyring`: тот на Windows жёстко пишет с `CRED_PERSIST_ENTERPRISE`
//! без возможности переключить, а на обычной (не доменной) машине с
//! Microsoft-аккаунтом такая запись не находится при чтении сразу же после
//! записи — проверено вживую отдельным пробником. На macOS/Linux `keyring`
//! этой проблемы не имеет, там он и остаётся.

#[cfg(target_os = "windows")]
mod windows_credential;

use tauri::{AppHandle, Emitter, State};

use crate::soundcloud::{ScClient, ScError, ScUser};

const SERVICE: &str = "soundrain";
const ACCOUNT: &str = "soundcloud_oauth_token";
const EVENT: &str = "auth:changed";

#[cfg(target_os = "windows")]
fn read_token() -> Option<String> {
    windows_credential::read(SERVICE, ACCOUNT)
}

#[cfg(target_os = "windows")]
fn write_token(token: &str) -> Result<(), String> {
    windows_credential::write(SERVICE, ACCOUNT, token)
}

#[cfg(target_os = "windows")]
fn clear_token() {
    windows_credential::delete(SERVICE, ACCOUNT);
}

#[cfg(not(target_os = "windows"))]
fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, ACCOUNT)
        .map_err(|e| format!("не удалось открыть системное хранилище: {e}"))
}

#[cfg(not(target_os = "windows"))]
fn read_token() -> Option<String> {
    let entry = entry().ok()?;
    entry.get_password().ok()
}

#[cfg(not(target_os = "windows"))]
fn write_token(token: &str) -> Result<(), String> {
    entry()?
        .set_password(token)
        .map_err(|e| format!("не удалось сохранить токен: {e}"))
}

#[cfg(not(target_os = "windows"))]
fn clear_token() {
    if let Ok(entry) = entry() {
        let _ = entry.delete_credential();
    }
}

/// Для команд вне `auth` (лента, лайки, плеер), которым нужен токен, но не
/// нужно знать про хранилище. Отсутствие токена здесь — программная ошибка
/// фронта (эти команды не должны вызываться до `authorized: true`), поэтому
/// сообщение осознанно техническое, а не пользовательское.
pub(crate) fn require_token() -> Result<String, ScError> {
    read_token().ok_or_else(|| ScError::network("нет сохранённого токена — сначала войдите"))
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    pub authorized: bool,
    pub user: Option<ScUser>,
}

impl AuthStatus {
    fn signed_out() -> Self {
        Self {
            authorized: false,
            user: None,
        }
    }
}

#[tauri::command]
pub async fn auth_status(sc: State<'_, ScClient>) -> Result<AuthStatus, ScError> {
    let Some(token) = read_token() else {
        return Ok(AuthStatus::signed_out());
    };
    match sc.get_me(&token).await {
        Ok(user) => Ok(AuthStatus {
            authorized: true,
            user: Some(user),
        }),
        // Токен реально отклонён SoundCloud — тихо разлогиниваем, а не пугаем
        // пользователя ошибкой при каждом запуске с протухшим токеном.
        Err(ScError::InvalidToken) => {
            clear_token();
            Ok(AuthStatus::signed_out())
        }
        // Сетевая ошибка — не трогаем сохранённый токен, фронт покажет "нет связи".
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub async fn auth_set_token(
    token: String,
    app: AppHandle,
    sc: State<'_, ScClient>,
) -> Result<ScUser, ScError> {
    let token = token.trim().to_string();
    let user = sc.get_me(&token).await?;
    write_token(&token).map_err(ScError::network)?;
    let _ = app.emit(
        EVENT,
        AuthStatus {
            authorized: true,
            user: Some(user.clone()),
        },
    );
    Ok(user)
}

#[tauri::command]
pub fn auth_logout(app: AppHandle) {
    clear_token();
    let _ = app.emit(EVENT, AuthStatus::signed_out());
}

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

use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, State, Url, WebviewUrl, WebviewWindowBuilder};

use crate::network::NetworkConfig;
use crate::soundcloud::{ScClient, ScError, ScUser};

const SERVICE: &str = "soundrain";
const ACCOUNT: &str = "soundcloud_oauth_token";
const EVENT: &str = "auth:changed";

const LOGIN_WINDOW_LABEL: &str = "sc-login";
const LOGIN_COOKIE_NAME: &str = "oauth_token";
const LOGIN_POLL_INTERVAL: Duration = Duration::from_millis(800);
const LOGIN_TIMEOUT: Duration = Duration::from_secs(300);

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

/// Вход через встроенное окно вместо ручного копирования `oauth_token` из
/// DevTools: открываем настоящий soundcloud.com в отдельном окне Tauri,
/// пользователь логинится как обычно (пароль, Google/Apple и т.д.), а мы в
/// фоне поллим куки этого окна и подхватываем `oauth_token`, как только он
/// появляется — тот же токен и та же проверка (`GET /me`), что и у ручного
/// ввода, разница только в том, как токен попадает в приложение.
#[tauri::command]
pub fn auth_start_oauth_login(
    app: AppHandle,
    network: State<'_, std::sync::Arc<NetworkConfig>>,
) -> Result<(), String> {
    if app.get_webview_window(LOGIN_WINDOW_LABEL).is_some() {
        // Уже открыто — не плодим второе окно, просто фокусируем.
        if let Some(w) = app.get_webview_window(LOGIN_WINDOW_LABEL) {
            let _ = w.set_focus();
        }
        return Ok(());
    }

    // Окно логина — отдельный WebView2 со своим сетевым стеком, наш общий
    // `reqwest::Client`/его прокси на него не действуют. Передаём тот же
    // прокси, что сейчас выбран в Настройках → Сеть, явно через
    // `proxy_url()` — иначе пользователь из РФ с включённым нашим прокси
    // не смог бы даже открыть soundcloud.com в этом окне.
    let proxy_url = network
        .current_proxy()
        .and_then(|url| Url::parse(&url).ok());

    // `.build()` дедлокается на Windows при синхронном вызове из обработчика
    // команды/события (см. миниплеер, тот же паттерн) — строим в отдельном потоке.
    let app = app.clone();
    std::thread::spawn(move || {
        let url = Url::parse("https://soundcloud.com/").expect("константный URL валиден");
        let mut builder = WebviewWindowBuilder::new(&app, LOGIN_WINDOW_LABEL, WebviewUrl::External(url))
            .title("Вход в SoundCloud")
            .inner_size(480.0, 760.0);
        if let Some(proxy) = proxy_url {
            builder = builder.proxy_url(proxy);
        }
        let window = match builder.build() {
            Ok(w) => w,
            Err(e) => {
                eprintln!("не удалось открыть окно логина: {e}");
                return;
            }
        };
        poll_login_window(app, window);
    });
    Ok(())
}

fn poll_login_window(app: AppHandle, window: tauri::WebviewWindow) {
    let cookie_url = Url::parse("https://soundcloud.com/").expect("константный URL валиден");
    let deadline = Instant::now() + LOGIN_TIMEOUT;
    let rt = tokio::runtime::Runtime::new().expect("tokio runtime");

    loop {
        std::thread::sleep(LOGIN_POLL_INTERVAL);

        // Пользователь сам закрыл окно, не дологинившись — тихо выходим,
        // без ошибки: это не сбой, а отказ от логина.
        if app.get_webview_window(LOGIN_WINDOW_LABEL).is_none() {
            return;
        }
        if Instant::now() > deadline {
            let _ = window.close();
            return;
        }

        let Ok(cookies) = window.cookies_for_url(cookie_url.clone()) else {
            continue;
        };
        let Some(token_cookie) = cookies.iter().find(|c| c.name() == LOGIN_COOKIE_NAME) else {
            continue;
        };
        let token = token_cookie.value().to_string();
        if token.is_empty() {
            continue;
        }

        let Some(sc) = app.try_state::<ScClient>() else {
            let _ = window.close();
            return;
        };
        match rt.block_on(sc.get_me(&token)) {
            Ok(user) => {
                if write_token(&token).is_ok() {
                    let _ = app.emit(
                        EVENT,
                        AuthStatus {
                            authorized: true,
                            user: Some(user),
                        },
                    );
                }
                let _ = window.close();
                return;
            }
            // Куки уже есть, но SoundCloud токен ещё не считает валидным
            // (момент между установкой куки и завершением редиректа) —
            // пробуем ещё раз на следующем тике, а не сдаёмся сразу.
            Err(_) => continue,
        }
    }
}

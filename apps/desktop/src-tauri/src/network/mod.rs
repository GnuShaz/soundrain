//! Общий HTTP-клиент на всё приложение — потребители: SoundCloud API
//! (`soundcloud::ScClient`), скачивание трека в кэш (`audio::resolve_cached_path`)
//! и (отдельно, свой сетевой стек WebView2, см. `current_proxy`) окно логина
//! (`auth::auth_start_oauth_login`). Настройки → «Сеть» (план, пункт 18)
//! позволяют переключиться на прокси/Zapret (для пользователей из РФ, где
//! SoundCloud заблокирован — по умолчанию приложение работает напрямую;
//! пробовали держать собственный прокси на VPS проекта включённым по
//! умолчанию, но реальные `reqwest`-запросы с клиентских машин к нему
//! стабильно рвались на `TunnelUnexpectedEof` — CONNECT-туннель
//! устанавливался, но обрывался до/во время TLS уже за пределами прокси
//! (сам прокси при этом подтверждённо исправен: те же запросы с VPS работали
//! штатно). Не выяснено до конца и решено не тратить время дальше — README
//! рекомендует Zapret, он уже реально работает у пользователей). Клиент не
//! создаётся заново на каждый запрос — только когда пользователь реально
//! меняет прокси, старый клиент (со своим пулом соединений) выбрасывается целиком.

use std::sync::RwLock;

use tauri::State;

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
     (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

pub struct NetworkConfig {
    client: RwLock<reqwest::Client>,
    /// Тот же URL, что сейчас в `client` — reqwest не отдаёт прокси клиента
    /// обратно, а он нужен отдельно: окно логина (WebView2) не использует
    /// наш `reqwest::Client` вообще, у него свой сетевой стек, и прокси туда
    /// нужно передать явно при создании окна (`WebviewWindowBuilder::proxy_url`).
    current_proxy_url: RwLock<Option<String>>,
}

impl NetworkConfig {
    pub fn new() -> Self {
        Self {
            client: RwLock::new(build_client(None).expect("клиент без прокси должен собираться всегда")),
            current_proxy_url: RwLock::new(None),
        }
    }

    /// `reqwest::Client` дёшево клонируется (внутри `Arc` на пул соединений) —
    /// вызывающий код каждый раз берёт свежий снимок, не держит блокировку
    /// на время самого запроса.
    pub fn client(&self) -> reqwest::Client {
        self.client
            .read()
            .expect("client lock не должен быть отравлен")
            .clone()
    }

    /// См. `current_proxy_url` — используется окном логина, чтобы WebView2
    /// шёл к soundcloud.com тем же путём, что и остальное приложение.
    pub fn current_proxy(&self) -> Option<String> {
        self.current_proxy_url
            .read()
            .expect("proxy url lock не должен быть отравлен")
            .clone()
    }

    pub fn set_proxy(&self, proxy_url: Option<&str>) -> Result<(), String> {
        let new_client = build_client(proxy_url)?;
        *self
            .client
            .write()
            .expect("client lock не должен быть отравлен") = new_client;
        *self
            .current_proxy_url
            .write()
            .expect("proxy url lock не должен быть отравлен") = proxy_url.map(String::from);
        Ok(())
    }
}

fn build_client(proxy_url: Option<&str>) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder().user_agent(USER_AGENT);
    if let Some(url) = proxy_url {
        let proxy =
            reqwest::Proxy::all(url).map_err(|e| format!("некорректный адрес прокси: {e}"))?;
        builder = builder.proxy(proxy);
    }
    builder.build().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn network_set_proxy(
    proxy_url: Option<String>,
    network: State<'_, std::sync::Arc<NetworkConfig>>,
) -> Result<(), String> {
    network.set_proxy(proxy_url.as_deref())
}

/// Реальный запрос к soundcloud.com через текущий клиент (с прокси или без)
/// — чтобы дать пользователю понятную диагностику сразу в настройках, а не
/// голую сетевую ошибку где-то в глубине приложения при первой попытке
/// авторизации.
#[tauri::command]
pub async fn network_check(network: State<'_, std::sync::Arc<NetworkConfig>>) -> Result<(), String> {
    let client = network.client();
    let resp = client
        .get("https://soundcloud.com/")
        .send()
        .await
        .map_err(|e| format!("нет соединения: {e}"))?;
    if resp.status().is_success() {
        Ok(())
    } else {
        Err(format!("SoundCloud ответил {}", resp.status()))
    }
}

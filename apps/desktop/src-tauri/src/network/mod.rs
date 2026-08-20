//! Общий HTTP-клиент на всё приложение — сейчас потребители два: SoundCloud
//! API (`soundcloud::ScClient`) и скачивание трека в кэш (`audio::resolve_cached_path`).
//! Настройки → «Сеть» (план, пункт 18) позволяют переключиться на прокси
//! (для пользователей из РФ, где SoundCloud заблокирован — часть "Zapret" из
//! плана сознательно не реализована в этом проходе: автоматическая правка
//! `list-general-user.txt` требует реальной установки zapret под рукой для
//! проверки, чего сейчас нет). Клиент не создаётся заново на каждый запрос —
//! только когда пользователь реально меняет прокси, старый клиент (со своим
//! пулом соединений) выбрасывается целиком.

use std::sync::RwLock;

use tauri::State;

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
     (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

pub struct NetworkConfig {
    client: RwLock<reqwest::Client>,
}

impl NetworkConfig {
    pub fn new() -> Self {
        Self {
            client: RwLock::new(
                build_client(None).expect("клиент без прокси должен собираться всегда"),
            ),
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

    pub fn set_proxy(&self, proxy_url: Option<&str>) -> Result<(), String> {
        let new_client = build_client(proxy_url)?;
        *self
            .client
            .write()
            .expect("client lock не должен быть отравлен") = new_client;
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

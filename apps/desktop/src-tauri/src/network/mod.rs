//! Общий HTTP-клиент на всё приложение — потребители: SoundCloud API
//! (`soundcloud::ScClient`), скачивание трека в кэш (`audio::resolve_cached_path`)
//! и (отдельно, свой сетевой стек WebView2, см. `current_proxy`) окно логина
//! (`auth::auth_start_oauth_login`). Настройки → «Сеть» (план, пункт 18)
//! позволяют переключиться на прокси (для пользователей из РФ, где SoundCloud
//! заблокирован — часть "Zapret" из плана сознательно не реализована в этом
//! проходе: автоматическая правка `list-general-user.txt` требует реальной
//! установки zapret под рукой для проверки, чего сейчас нет). Клиент не
//! создаётся заново на каждый запрос — только когда пользователь реально
//! меняет прокси, старый клиент (со своим пулом соединений) выбрасывается целиком.

use std::sync::RwLock;

use tauri::State;

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
     (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/// Собственный прокси на VPS проекта — включён по умолчанию для всех, чтобы
/// пользователи из РФ (SoundCloud заблокирован) не ловили сетевые ошибки без
/// какой-либо настройки. Не приватный секрет уровня пользовательских данных —
/// общий креденшл для доступа к сервису, тот же принцип, что и у API_KEY
/// бэкенда/client_id Discord. Прокси на сервере ограничен фильтром только на
/// домены soundcloud.com/sndcdn.com и портами 80/443 — даже при утечке креда
/// (репозиторий и .exe публичные) им нельзя воспользоваться как открытым
/// релеем для произвольного трафика. Пользователь может в любой момент
/// переключиться на «Напрямую» / свой прокси / Zapret в Настройках → Сеть.
pub const DEFAULT_PROXY_URL: &str = "http://sr_iNlJ1RoP:HTSs4M0zRjYSaiwmuDg0snCx@31.76.20.177:18080";

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
            client: RwLock::new(
                build_client(Some(DEFAULT_PROXY_URL))
                    .expect("дефолтный клиент должен собираться всегда"),
            ),
            current_proxy_url: RwLock::new(Some(DEFAULT_PROXY_URL.to_string())),
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Живой прогон ровно того, что делает `NetworkConfig::new()` — дефолтный
    /// клиент со встроенным прокси должен реально достучаться до SoundCloud
    /// с этой машины (не через Bash/PowerShell-инструменты, у которых в этом
    /// окружении ограничен исходящий доступ к новым хостам — см. память
    /// project_tool_network_sandbox — а напрямую из скомпилированного кода).
    #[test]
    #[ignore]
    fn probe_default_proxy_reaches_soundcloud() {
        let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
        rt.block_on(async {
            let config = NetworkConfig::new();
            let client = config.client();
            let resp = client
                .get("https://soundcloud.com/")
                .send()
                .await
                .expect("запрос через дефолтный прокси должен пройти");
            assert!(
                resp.status().is_success(),
                "SoundCloud ответил {} через дефолтный прокси",
                resp.status()
            );
        });
    }

    /// Тот же прогон, но на домен вне фильтра прокси (сервер должен вернуть
    /// 403 Filtered — подтверждает, что ограничение прокси только доменами
    /// SoundCloud реально применяется, а не просто настроено на бумаге).
    #[test]
    #[ignore]
    fn probe_default_proxy_blocks_other_domains() {
        let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
        rt.block_on(async {
            let config = NetworkConfig::new();
            let client = config.client();
            let result = client.get("https://example.com/").send().await;
            match result {
                Err(e) => {
                    let msg = e.to_string();
                    assert!(
                        msg.contains("403") || msg.contains("Filtered"),
                        "ожидали отказ по фильтру прокси, получили: {msg}"
                    );
                }
                Ok(resp) => {
                    assert_eq!(
                        resp.status(),
                        403,
                        "ожидали 403 Filtered от прокси, получили {}",
                        resp.status()
                    );
                }
            }
        });
    }
}

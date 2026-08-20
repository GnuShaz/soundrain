//! Минимальный клиент api-v2.soundcloud.com.
//!
//! `client_id` не выдаётся официально сторонним приложениям — он вытаскивается
//! из JS-бандлов главной страницы soundcloud.com (тот же приём, что использует
//! сам веб-плеер SoundCloud). Бандл, где он лежит, от сборки к сборке разный,
//! поэтому перебираем все найденные скрипты, а не полагаемся на один файл.
//!
//! `oauth_token`, несмотря на название, живёт в cookie `soundcloud.com`, а не
//! в Local Storage (проверено вживую на реальном аккаунте) — экран логина
//! отправляет пользователя за ним именно туда.

use std::sync::{Arc, RwLock};

use regex::Regex;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::auth;
use crate::network::NetworkConfig;

const HOMEPAGE: &str = "https://soundcloud.com/";
const API_BASE: &str = "https://api-v2.soundcloud.com";
const PAGE_SIZE: u32 = 30;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScUser {
    pub id: i64,
    pub username: String,
    pub avatar_url: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: i64,
    pub title: String,
    pub artist: String,
    /// Нужен, чтобы клик по нику исполнителя (в `TrackRow`/карточках/
    /// плеер-баре) знал, куда открывать страницу — план, пункт 14.
    pub artist_id: i64,
    pub artwork_url: Option<String>,
    pub duration_ms: i64,
    pub permalink_url: String,
    pub streamable: bool,
}

/// Профиль исполнителя — `GET /users/{id}`, не документирован, форма
/// проверена вживую (`tests::probe_user_profile`).
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistProfile {
    pub id: i64,
    pub username: String,
    pub avatar_url: Option<String>,
    pub description: Option<String>,
    pub permalink_url: String,
    pub followers_count: i64,
    pub track_count: i64,
    pub playlist_count: i64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackStream {
    pub url: String,
    pub duration_ms: i64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackPage {
    pub tracks: Vec<Track>,
    /// `next_href` от SoundCloud как есть — фронт просто отдаёт его обратно
    /// в `cursor` для подгрузки следующей страницы, не разбирая формат.
    pub next_cursor: Option<String>,
}

/// Карточка в полке домашней ленты. `SoundCloud` мешает в одном разделе
/// `mixed-selections` два разных вида сущностей: `system-playlist` (мини-микс,
/// вроде "Recently Played"/"Mixed for You" — трек-id уже известны прямо в
/// ответе) и обычный `playlist`/альбом (только `trackCount`, id треков нужно
/// подтягивать отдельно через `sc_playlist_track_ids`). `id` — urn для
/// первого вида, числовой id (строкой) для второго; фронт не должен его
/// парсить, только отдавать обратно в `sc_playlist_track_ids`/плеер.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistCard {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub artwork_url: Option<String>,
    pub track_count: i64,
    /// Есть сразу для `system-playlist` — экономит поход за деталями плейлиста.
    pub track_ids: Option<Vec<i64>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedSection {
    pub title: String,
    pub items: Vec<PlaylistCard>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistPage {
    pub playlists: Vec<PlaylistCard>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ScError {
    /// Токен отклонён SoundCloud (401) — не путать с сетевой ошибкой,
    /// фронт должен предложить разные подсказки.
    InvalidToken,
    Network { message: String },
}

impl ScError {
    pub fn network(msg: impl Into<String>) -> Self {
        ScError::Network { message: msg.into() }
    }
}

pub struct ScClient {
    /// Общий на всё приложение клиент (настройки → «Сеть», план пункт 18) —
    /// не свой собственный, чтобы переключение прокси действовало и здесь,
    /// и на скачивании трека (`audio::resolve_cached_path`) одновременно.
    network: Arc<NetworkConfig>,
    client_id: RwLock<Option<String>>,
    /// id текущего пользователя из последнего успешного `get_me` — нужен для
    /// `/users/{id}/track_likes`, чтобы фронту не приходилось таскать его
    /// через каждую команду отдельно.
    me_id: RwLock<Option<i64>>,
}

impl ScClient {
    pub fn new(network: Arc<NetworkConfig>) -> Self {
        Self {
            network,
            client_id: RwLock::new(None),
            me_id: RwLock::new(None),
        }
    }

    fn http(&self) -> reqwest::Client {
        self.network.client()
    }

    fn cached_client_id(&self) -> Option<String> {
        self.client_id.read().unwrap().clone()
    }

    fn store_client_id(&self, id: &str) {
        *self.client_id.write().unwrap() = Some(id.to_string());
    }

    fn invalidate_client_id(&self) {
        *self.client_id.write().unwrap() = None;
    }

    async fn discover_client_id(&self) -> Result<String, ScError> {
        let html = self
            .http()
            .get(HOMEPAGE)
            .send()
            .await
            .map_err(|e| ScError::network(format!("не удалось открыть soundcloud.com: {e}")))?
            .text()
            .await
            .map_err(|e| ScError::network(format!("не удалось прочитать soundcloud.com: {e}")))?;

        let script_re = Regex::new(r#"https://a-v2\.sndcdn\.com/assets/[0-9a-zA-Z._-]+\.js"#)
            .expect("valid regex");
        let id_re = Regex::new(r#"client_id[:=]"([0-9a-zA-Z]{32})""#).expect("valid regex");

        let script_urls: Vec<String> = script_re
            .find_iter(&html)
            .map(|m| m.as_str().to_string())
            .collect();

        if script_urls.is_empty() {
            return Err(ScError::network(
                "не нашли ни одного JS-бандла на странице soundcloud.com",
            ));
        }

        for url in script_urls {
            let Ok(resp) = self.http().get(&url).send().await else {
                continue;
            };
            let Ok(body) = resp.text().await else {
                continue;
            };
            if let Some(caps) = id_re.captures(&body) {
                let id = caps[1].to_string();
                self.store_client_id(&id);
                return Ok(id);
            }
        }

        Err(ScError::network(
            "client_id не найден ни в одном из бандлов soundcloud.com",
        ))
    }

    async fn client_id(&self) -> Result<String, ScError> {
        if let Some(id) = self.cached_client_id() {
            return Ok(id);
        }
        self.discover_client_id().await
    }

    /// Единая точка для всех авторизованных GET-запросов. При 401 не отличить
    /// "токен реально невалиден" от "протух client_id" — перепроверяем со
    /// свежим `client_id`. Если и это 401 — даём ещё один шанс после паузы:
    /// вызывающий код (`auth_status`) молча разлогинивает при `InvalidToken`,
    /// а транзиентные 401 от SoundCloud на re-auth реально случаются, и
    /// ложный разлогин намного хуже лишнего запроса.
    async fn authed_get<T: DeserializeOwned>(&self, url: &str, token: &str) -> Result<T, ScError> {
        match self.authed_get_once(url, token).await {
            Err(ScError::InvalidToken) => {
                self.invalidate_client_id();
                match self.authed_get_once(url, token).await {
                    Err(ScError::InvalidToken) => {
                        tokio::time::sleep(std::time::Duration::from_millis(400)).await;
                        self.authed_get_once(url, token).await
                    }
                    other => other,
                }
            }
            other => other,
        }
    }

    async fn authed_get_once<T: DeserializeOwned>(
        &self,
        url: &str,
        token: &str,
    ) -> Result<T, ScError> {
        let client_id = self.client_id().await?;
        let sep = if url.contains('?') { '&' } else { '?' };
        let full = format!("{url}{sep}client_id={client_id}");

        let resp = self
            .http()
            .get(&full)
            .header("Authorization", format!("OAuth {token}"))
            .send()
            .await
            .map_err(|e| ScError::network(format!("нет соединения с SoundCloud: {e}")))?;

        if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(ScError::InvalidToken);
        }
        if !resp.status().is_success() {
            return Err(ScError::network(format!(
                "SoundCloud ответил {}",
                resp.status()
            )));
        }

        resp.json::<T>()
            .await
            .map_err(|e| ScError::network(format!("не удалось разобрать ответ SoundCloud: {e}")))
    }

    /// Общая часть `like`/`unlike`: запрос без тела ответа, с тем же
    /// одноразовым retry по `client_id`, что и у `authed_get`. `unlike`
    /// на уже нелайкнутый трек SoundCloud отвечает `404` — считаем это
    /// успехом (идемпотентно), а не ошибкой.
    async fn authed_mutate_once(
        &self,
        method: reqwest::Method,
        url: &str,
        token: &str,
        treat_404_as_ok: bool,
    ) -> Result<(), ScError> {
        let client_id = self.client_id().await?;
        let sep = if url.contains('?') { '&' } else { '?' };
        let full = format!("{url}{sep}client_id={client_id}");

        let resp = self
            .http()
            .request(method, &full)
            .header("Authorization", format!("OAuth {token}"))
            .header("Content-Length", "0")
            .header("Origin", "https://soundcloud.com")
            .header("Referer", "https://soundcloud.com/")
            .header("Accept", "application/json, text/javascript, */*; q=0.01")
            .header("Accept-Language", "en-US,en;q=0.9")
            .header("sec-ch-ua", "\"Chromium\";v=\"126\", \"Not.A/Brand\";v=\"24\", \"Google Chrome\";v=\"126\"")
            .header("sec-ch-ua-mobile", "?0")
            .header("sec-ch-ua-platform", "\"Windows\"")
            .header("sec-fetch-dest", "empty")
            .header("sec-fetch-mode", "cors")
            .header("sec-fetch-site", "same-site")
            .header("X-Requested-With", "XMLHttpRequest")
            .send()
            .await
            .map_err(|e| ScError::network(format!("нет соединения с SoundCloud: {e}")))?;

        if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(ScError::InvalidToken);
        }
        if treat_404_as_ok && resp.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(());
        }
        if !resp.status().is_success() {
            return Err(ScError::network(format!(
                "SoundCloud ответил {}",
                resp.status()
            )));
        }
        Ok(())
    }

    async fn authed_mutate(
        &self,
        method: reqwest::Method,
        url: &str,
        token: &str,
        treat_404_as_ok: bool,
    ) -> Result<(), ScError> {
        match self
            .authed_mutate_once(method.clone(), url, token, treat_404_as_ok)
            .await
        {
            Err(ScError::InvalidToken) => {
                self.invalidate_client_id();
                self.authed_mutate_once(method, url, token, treat_404_as_ok)
                    .await
            }
            other => other,
        }
    }

    /// Настоящий эндпоинт лайка — не `/likes/tracks/{id}` (первое разумное
    /// предположение, отдаёт `404`), а `/users/{my_id}/track_likes/{id}` —
    /// тот же путь, что и у чтения (`get_track_likes`), просто с методом
    /// `PUT`/`DELETE`. Подтверждено перехватом настоящего запроса веб-плеера
    /// soundcloud.com — угадать по документации было неоткуда, публичного
    /// описания этого эндпоинта нет.
    pub async fn like_track(&self, token: &str, track_id: i64) -> Result<(), ScError> {
        let my_id = self.my_user_id(token).await?;
        self.authed_mutate(
            reqwest::Method::PUT,
            &format!("{API_BASE}/users/{my_id}/track_likes/{track_id}"),
            token,
            false,
        )
        .await
    }

    pub async fn unlike_track(&self, token: &str, track_id: i64) -> Result<(), ScError> {
        let my_id = self.my_user_id(token).await?;
        self.authed_mutate(
            reqwest::Method::DELETE,
            &format!("{API_BASE}/users/{my_id}/track_likes/{track_id}"),
            token,
            true,
        )
        .await
    }

    pub async fn get_me(&self, token: &str) -> Result<ScUser, ScError> {
        #[derive(Deserialize)]
        struct MeResponse {
            id: i64,
            username: String,
            avatar_url: Option<String>,
        }

        let me: MeResponse = self.authed_get(&format!("{API_BASE}/me"), token).await?;
        *self.me_id.write().unwrap() = Some(me.id);
        Ok(ScUser {
            id: me.id,
            username: me.username,
            avatar_url: me.avatar_url,
        })
    }

    async fn my_user_id(&self, token: &str) -> Result<i64, ScError> {
        if let Some(id) = *self.me_id.read().unwrap() {
            return Ok(id);
        }
        Ok(self.get_me(token).await?.id)
    }

    /// `/stream` вперемешку отдаёт треки и плейлисты (в т.ч. репосты) —
    /// в MVP лента показывает только треки, остальное отбрасываем.
    pub async fn get_stream(
        &self,
        token: &str,
        cursor: Option<&str>,
    ) -> Result<TrackPage, ScError> {
        #[derive(Deserialize)]
        struct StreamItem {
            #[serde(rename = "type")]
            kind: String,
            track: Option<RawTrack>,
        }

        let url = cursor
            .map(str::to_string)
            .unwrap_or_else(|| format!("{API_BASE}/stream?limit={PAGE_SIZE}"));
        let page: CollectionResponse<StreamItem> = self.authed_get(&url, token).await?;

        let tracks = page
            .collection
            .into_iter()
            .filter(|item| item.kind == "track" || item.kind == "track-repost")
            .filter_map(|item| item.track)
            .map(Track::from)
            .collect();

        Ok(TrackPage {
            tracks,
            next_cursor: page.next_href,
        })
    }

    /// `/users/{id}/track_likes` — уже только треки, без обёртки по типу.
    pub async fn get_track_likes(
        &self,
        token: &str,
        cursor: Option<&str>,
    ) -> Result<TrackPage, ScError> {
        // В отличие от /stream, каждый элемент здесь — не голый трек, а
        // `{ created_at, kind, track }` (проверено вживую на реальном
        // ответе — до этого предполагалось, ошибочно, что обёртки нет,
        // отсюда "не удалось разобрать ответ SoundCloud").
        #[derive(Deserialize)]
        struct LikeItem {
            track: RawTrack,
        }

        let url = match cursor {
            Some(c) => c.to_string(),
            None => {
                let id = self.my_user_id(token).await?;
                format!("{API_BASE}/users/{id}/track_likes?limit={PAGE_SIZE}")
            }
        };
        let page: CollectionResponse<LikeItem> = self.authed_get(&url, token).await?;

        Ok(TrackPage {
            tracks: page
                .collection
                .into_iter()
                .map(|item| Track::from(item.track))
                .collect(),
            next_cursor: page.next_href,
        })
    }

    /// `/search/tracks` — уже только треки, тот же формат, что и лайки.
    pub async fn search_tracks(
        &self,
        token: &str,
        query: &str,
        cursor: Option<&str>,
    ) -> Result<TrackPage, ScError> {
        let url = match cursor {
            Some(c) => c.to_string(),
            None => {
                let mut url = reqwest::Url::parse(&format!("{API_BASE}/search/tracks"))
                    .expect("static base URL is valid");
                url.query_pairs_mut()
                    .append_pair("q", query)
                    .append_pair("limit", &PAGE_SIZE.to_string());
                url.to_string()
            }
        };
        let page: CollectionResponse<RawTrack> = self.authed_get(&url, token).await?;

        Ok(TrackPage {
            tracks: page.collection.into_iter().map(Track::from).collect(),
            next_cursor: page.next_href,
        })
    }

    /// `/search/playlists` — не документирован, найден и проверен живьём
    /// пробником (`tests::probe_search_playlists`). В отличие от обычного
    /// плейлиста в `mixed-selections`, где id треков нужно было догружать
    /// отдельным походом ([`Self::get_playlist_track_ids`]), здесь SoundCloud
    /// сразу отдаёт **все** id в поле `tracks` (первые ~5 — целиком, остальные
    /// — id-заглушки), не только первую страницу — проверено на плейлисте с
    /// 416 треками, все 416 присутствуют. Поэтому `track_ids` у результата
    /// поиска плейлистов всегда `Some`, второго запроса `PlaylistView` не
    /// делает (см. `api.scPlaylistTrackIds` fallback во фронте — просто не
    /// срабатывает для этого источника).
    pub async fn search_playlists(
        &self,
        token: &str,
        query: &str,
        cursor: Option<&str>,
    ) -> Result<PlaylistPage, ScError> {
        #[derive(Deserialize)]
        struct RawPlaylist {
            id: i64,
            kind: String,
            title: String,
            artwork_url: Option<String>,
            track_count: i64,
            #[serde(default)]
            tracks: Vec<RawTrackIdStub>,
        }
        #[derive(Deserialize)]
        struct RawTrackIdStub {
            id: i64,
        }

        let url = match cursor {
            Some(c) => c.to_string(),
            None => {
                let mut url = reqwest::Url::parse(&format!("{API_BASE}/search/playlists"))
                    .expect("static base URL is valid");
                url.query_pairs_mut()
                    .append_pair("q", query)
                    .append_pair("limit", &PAGE_SIZE.to_string());
                url.to_string()
            }
        };
        let page: CollectionResponse<RawPlaylist> = self.authed_get(&url, token).await?;

        let playlists = page
            .collection
            .into_iter()
            .map(|p| PlaylistCard {
                id: p.id.to_string(),
                kind: p.kind,
                title: p.title,
                artwork_url: p.artwork_url,
                track_count: p.track_count,
                track_ids: Some(p.tracks.into_iter().map(|t| t.id).collect()),
            })
            .collect();

        Ok(PlaylistPage {
            playlists,
            next_cursor: page.next_href,
        })
    }

    /// `/users/{id}` — профиль исполнителя, не документирован, форма
    /// проверена живьём (`tests::probe_user_profile`).
    pub async fn get_user_profile(&self, token: &str, user_id: i64) -> Result<ArtistProfile, ScError> {
        #[derive(Deserialize)]
        struct RawUserProfile {
            id: i64,
            username: String,
            avatar_url: Option<String>,
            description: Option<String>,
            permalink_url: String,
            followers_count: i64,
            track_count: i64,
            playlist_count: i64,
        }

        let raw: RawUserProfile = self
            .authed_get(&format!("{API_BASE}/users/{user_id}"), token)
            .await?;

        Ok(ArtistProfile {
            id: raw.id,
            username: raw.username,
            avatar_url: raw.avatar_url,
            description: raw.description,
            permalink_url: raw.permalink_url,
            followers_count: raw.followers_count,
            track_count: raw.track_count,
            playlist_count: raw.playlist_count,
        })
    }

    /// `/users/{id}/tracks` — та же форма ответа, что и `/search/tracks`,
    /// проверено вместе с профилем (`tests::probe_user_profile`).
    pub async fn get_user_tracks(
        &self,
        token: &str,
        user_id: i64,
        cursor: Option<&str>,
    ) -> Result<TrackPage, ScError> {
        let url = match cursor {
            Some(c) => c.to_string(),
            None => {
                let mut url = reqwest::Url::parse(&format!("{API_BASE}/users/{user_id}/tracks"))
                    .expect("static base URL is valid");
                url.query_pairs_mut().append_pair("limit", &PAGE_SIZE.to_string());
                url.to_string()
            }
        };
        let page: CollectionResponse<RawTrack> = self.authed_get(&url, token).await?;

        Ok(TrackPage {
            tracks: page.collection.into_iter().map(Track::from).collect(),
            next_cursor: page.next_href,
        })
    }

    /// `/users/{id}/playlists` — та же форма, что и `/search/playlists`
    /// (полный список id треков сразу в `tracks`), проверено вживую
    /// (`tests::probe_user_profile`).
    pub async fn get_user_playlists(
        &self,
        token: &str,
        user_id: i64,
        cursor: Option<&str>,
    ) -> Result<PlaylistPage, ScError> {
        #[derive(Deserialize)]
        struct RawPlaylist {
            id: i64,
            kind: String,
            title: String,
            artwork_url: Option<String>,
            track_count: i64,
            #[serde(default)]
            tracks: Vec<RawTrackIdStub>,
        }
        #[derive(Deserialize)]
        struct RawTrackIdStub {
            id: i64,
        }

        let url = match cursor {
            Some(c) => c.to_string(),
            None => {
                let mut url =
                    reqwest::Url::parse(&format!("{API_BASE}/users/{user_id}/playlists"))
                        .expect("static base URL is valid");
                url.query_pairs_mut().append_pair("limit", &PAGE_SIZE.to_string());
                url.to_string()
            }
        };
        let page: CollectionResponse<RawPlaylist> = self.authed_get(&url, token).await?;

        let playlists = page
            .collection
            .into_iter()
            .map(|p| PlaylistCard {
                id: p.id.to_string(),
                kind: p.kind,
                title: p.title,
                artwork_url: p.artwork_url,
                track_count: p.track_count,
                track_ids: Some(p.tracks.into_iter().map(|t| t.id).collect()),
            })
            .collect();

        Ok(PlaylistPage {
            playlists,
            next_cursor: page.next_href,
        })
    }

    /// `/mixed-selections` — родной движок рекомендаций SoundCloud: 8
    /// именованных персонализированных разделов ("More of what you like",
    /// "Recently Played", "Mixed for You", "Trending by genre" и т.д.),
    /// найдено перехватом реального запроса /discover, публичной
    /// документации нет. Каждый раздел — не треки, а карточки мини-плейлистов
    /// (`system-playlist`) или альбомов (`playlist`) — сами треки резолвятся
    /// отдельно, см. [`Self::resolve_tracks`]/[`Self::get_playlist_track_ids`].
    pub async fn get_home_feed(&self, token: &str) -> Result<Vec<FeedSection>, ScError> {
        #[derive(Deserialize)]
        struct MixedSelectionsResponse {
            collection: Vec<RawSection>,
        }
        #[derive(Deserialize)]
        struct RawSection {
            title: String,
            items: RawItemsCollection,
        }
        #[derive(Deserialize)]
        struct RawItemsCollection {
            collection: Vec<RawSelectionItem>,
        }
        #[derive(Deserialize)]
        struct RawSelectionItem {
            kind: String,
            #[serde(default)]
            urn: Option<String>,
            // Для system-playlist `id` иногда приходит полным urn-текстом
            // ("soundcloud:system-playlists:personalized-tracks:...:123"),
            // а не числом — проверено на реальном ответе (первая версия с
            // `Option<i64>` падала с "invalid type: string").
            #[serde(default)]
            id: Option<RawId>,
            title: String,
            artwork_url: Option<String>,
            #[serde(default)]
            track_count: Option<i64>,
            #[serde(default)]
            tracks: Option<Vec<RawTrackIdStub>>,
        }
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum RawId {
            Number(i64),
            Text(String),
        }
        #[derive(Deserialize)]
        struct RawTrackIdStub {
            id: i64,
        }

        let resp: MixedSelectionsResponse =
            self.authed_get(&format!("{API_BASE}/mixed-selections"), token).await?;

        let sections = resp
            .collection
            .into_iter()
            .map(|section| {
                let items = section
                    .items
                    .collection
                    .into_iter()
                    .filter_map(|item| {
                        let id = match (&item.urn, item.id) {
                            (Some(urn), _) => urn.clone(),
                            (None, Some(RawId::Number(n))) => n.to_string(),
                            (None, Some(RawId::Text(s))) => s,
                            (None, None) => return None,
                        };
                        let track_ids: Option<Vec<i64>> =
                            item.tracks.map(|stubs| stubs.iter().map(|t| t.id).collect());
                        let track_count = item
                            .track_count
                            .or_else(|| track_ids.as_ref().map(|ids| ids.len() as i64))
                            .unwrap_or(0);
                        Some(PlaylistCard {
                            id,
                            kind: item.kind,
                            title: item.title,
                            artwork_url: item.artwork_url,
                            track_count,
                            track_ids,
                        })
                    })
                    .collect();
                FeedSection { title: section.title, items }
            })
            .collect();

        Ok(sections)
    }

    /// `/tracks?ids=1,2,3` — batch-resolve id треков-заглушек (из мини-плейлиста
    /// в `mixed-selections`, либо из обычного плейлиста) в полные объекты.
    /// Тот же приём закрывает и старое ограничение с обычными плейлистами —
    /// SoundCloud отдаёт в объекте плейлиста только первые ~5 треков целиком,
    /// остальные — такие же заглушки-id.
    pub async fn resolve_tracks(&self, token: &str, ids: &[i64]) -> Result<Vec<Track>, ScError> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let ids_param = ids
            .iter()
            .map(i64::to_string)
            .collect::<Vec<_>>()
            .join(",");
        let raw: Vec<RawTrack> = self
            .authed_get(&format!("{API_BASE}/tracks?ids={ids_param}"), token)
            .await?;
        Ok(raw.into_iter().map(Track::from).collect())
    }

    /// Обычный плейлист/альбом не несёт id треков в `mixed-selections` —
    /// нужен отдельный поход за деталями плейлиста, чтобы затем прогнать
    /// список через [`Self::resolve_tracks`].
    pub async fn get_playlist_track_ids(
        &self,
        token: &str,
        playlist_id: i64,
    ) -> Result<Vec<i64>, ScError> {
        #[derive(Deserialize)]
        struct RawPlaylist {
            tracks: Vec<RawTrackIdStub>,
        }
        #[derive(Deserialize)]
        struct RawTrackIdStub {
            id: i64,
        }

        let playlist: RawPlaylist = self
            .authed_get(&format!("{API_BASE}/playlists/{playlist_id}"), token)
            .await?;
        Ok(playlist.tracks.into_iter().map(|t| t.id).collect())
    }

    /// Полная карточка трека содержит `media.transcodings` — список потоков в
    /// разных форматах (progressive mp3, HLS). Берём только `progressive`:
    /// его можно скачать одним GET и отдать rodio напрямую, без сборки HLS.
    /// Сама ссылка транскодинга — ещё не медиа-URL, а промежуточный
    /// авторизованный эндпоинт, который в ответ отдаёт настоящий CDN-адрес.
    pub async fn resolve_stream(
        &self,
        token: &str,
        track_id: i64,
    ) -> Result<TrackStream, ScError> {
        #[derive(Deserialize)]
        struct FullTrack {
            duration: i64,
            media: Media,
        }
        #[derive(Deserialize)]
        struct Media {
            transcodings: Vec<Transcoding>,
        }
        #[derive(Deserialize)]
        struct Transcoding {
            url: String,
            format: Format,
        }
        #[derive(Deserialize)]
        struct Format {
            protocol: String,
        }
        #[derive(Deserialize)]
        struct ResolvedMedia {
            url: String,
        }

        let track: FullTrack = self
            .authed_get(&format!("{API_BASE}/tracks/{track_id}"), token)
            .await?;

        let progressive = track
            .media
            .transcodings
            .iter()
            .find(|t| t.format.protocol == "progressive")
            .ok_or_else(|| {
                ScError::network(
                    "у трека нет progressive-потока (только HLS) — воспроизведение пока не поддерживается",
                )
            })?;

        let resolved: ResolvedMedia = self.authed_get(&progressive.url, token).await?;

        Ok(TrackStream {
            url: resolved.url,
            duration_ms: track.duration,
        })
    }
}

#[derive(Deserialize)]
struct CollectionResponse<T> {
    collection: Vec<T>,
    next_href: Option<String>,
}

#[derive(Deserialize)]
struct RawTrack {
    id: i64,
    title: String,
    artwork_url: Option<String>,
    duration: i64,
    permalink_url: String,
    streamable: bool,
    user: RawUser,
}

#[derive(Deserialize)]
struct RawUser {
    id: i64,
    username: String,
}

impl From<RawTrack> for Track {
    fn from(raw: RawTrack) -> Self {
        Track {
            id: raw.id,
            title: raw.title,
            artist: raw.user.username,
            artist_id: raw.user.id,
            artwork_url: raw.artwork_url,
            duration_ms: raw.duration,
            permalink_url: raw.permalink_url,
            streamable: raw.streamable,
        }
    }
}

#[tauri::command]
pub async fn sc_stream(
    cursor: Option<String>,
    sc: State<'_, ScClient>,
) -> Result<TrackPage, ScError> {
    let token = auth::require_token()?;
    sc.get_stream(&token, cursor.as_deref()).await
}

#[tauri::command]
pub async fn sc_likes(
    cursor: Option<String>,
    sc: State<'_, ScClient>,
) -> Result<TrackPage, ScError> {
    let token = auth::require_token()?;
    sc.get_track_likes(&token, cursor.as_deref()).await
}

#[tauri::command]
pub async fn sc_search_tracks(
    query: String,
    cursor: Option<String>,
    sc: State<'_, ScClient>,
) -> Result<TrackPage, ScError> {
    let token = auth::require_token()?;
    sc.search_tracks(&token, &query, cursor.as_deref()).await
}

#[tauri::command]
pub async fn sc_search_playlists(
    query: String,
    cursor: Option<String>,
    sc: State<'_, ScClient>,
) -> Result<PlaylistPage, ScError> {
    let token = auth::require_token()?;
    sc.search_playlists(&token, &query, cursor.as_deref()).await
}

#[tauri::command]
pub async fn sc_user_profile(
    user_id: i64,
    sc: State<'_, ScClient>,
) -> Result<ArtistProfile, ScError> {
    let token = auth::require_token()?;
    sc.get_user_profile(&token, user_id).await
}

#[tauri::command]
pub async fn sc_user_tracks(
    user_id: i64,
    cursor: Option<String>,
    sc: State<'_, ScClient>,
) -> Result<TrackPage, ScError> {
    let token = auth::require_token()?;
    sc.get_user_tracks(&token, user_id, cursor.as_deref()).await
}

#[tauri::command]
pub async fn sc_user_playlists(
    user_id: i64,
    cursor: Option<String>,
    sc: State<'_, ScClient>,
) -> Result<PlaylistPage, ScError> {
    let token = auth::require_token()?;
    sc.get_user_playlists(&token, user_id, cursor.as_deref()).await
}

#[tauri::command]
pub async fn sc_track_stream(
    track_id: i64,
    sc: State<'_, ScClient>,
) -> Result<TrackStream, ScError> {
    let token = auth::require_token()?;
    sc.resolve_stream(&token, track_id).await
}

#[tauri::command]
pub async fn sc_like(track_id: i64, sc: State<'_, ScClient>) -> Result<(), ScError> {
    let token = auth::require_token()?;
    sc.like_track(&token, track_id).await
}

#[tauri::command]
pub async fn sc_unlike(track_id: i64, sc: State<'_, ScClient>) -> Result<(), ScError> {
    let token = auth::require_token()?;
    sc.unlike_track(&token, track_id).await
}

#[tauri::command]
pub async fn sc_home_feed(sc: State<'_, ScClient>) -> Result<Vec<FeedSection>, ScError> {
    let token = auth::require_token()?;
    sc.get_home_feed(&token).await
}

#[tauri::command]
pub async fn sc_resolve_tracks(
    ids: Vec<i64>,
    sc: State<'_, ScClient>,
) -> Result<Vec<Track>, ScError> {
    let token = auth::require_token()?;
    sc.resolve_tracks(&token, &ids).await
}

#[tauri::command]
pub async fn sc_playlist_track_ids(
    playlist_id: i64,
    sc: State<'_, ScClient>,
) -> Result<Vec<i64>, ScError> {
    let token = auth::require_token()?;
    sc.get_playlist_track_ids(&token, playlist_id).await
}

/// Диагностический пробник для бага "лайк в настоящем приложении откатывается,
/// хотя тот же PUT/DELETE напрямую из браузера (включая `credentials: 'omit'`,
/// т.е. вообще без cookies) проходит с 200". Гоняет ровно тот же код
/// (`ScClient::like_track`/`unlike_track`), что и настоящее приложение, с
/// реальным сохранённым токеном — не печатает сам токен.
///
/// **Вывод по итогам живого дебага (см. план, шаг 6):** `PUT
/// /users/{id}/track_likes/{id}` стабильно отвечает `403` из этого клиента —
/// проверено на нескольких свежих (ни разу не лайкнутых) треках, так что это
/// не анти-спам на повтор лайка одного трека. Перебраны и не помогли:
/// `Origin`/`Referer`, полный набор `sec-fetch-*`/`sec-ch-ua`/`Accept*`
/// заголовков браузера, принудительный HTTP/1.1 вместо HTTP/2. При этом
/// `GET`-запросы (стрим/поиск/лайки/резолв трека) тем же клиентом работают
/// без проблем — блокируется именно мутирующий запрос. Похоже на TLS/HTTP2-
/// фингерпринтинг (JA3/JA4) WAF'ом SoundCloud конкретно на пишущих
/// эндпоинтах — обычный `reqwest` не может притвориться настоящим Chrome на
/// этом уровне. Вероятный путь дальше — `wreq` (форк reqwest с эмуляцией
/// TLS-отпечатка браузера, тот самый `wreq`, упомянутый в исходном
/// исследовании референсного проекта), но это отдельная зависимость
/// (BoringSSL, требует cmake в тулчейне) — сознательно не подключена без
/// решения пользователя.
///
/// Запуск: `cargo test --lib soundcloud::tests::probe_like_unlike -- --ignored --nocapture`
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore]
    fn probe_like_unlike() {
        let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
        rt.block_on(async {
            let token = crate::auth::require_token()
                .expect("нет сохранённого токена — сначала войдите в настоящем приложении");
            let client = ScClient::new(Arc::new(crate::network::NetworkConfig::new()));

            let me = client.get_me(&token).await.expect("get_me should succeed");
            println!("me: id={}", me.id);

            let search = client
                .search_tracks(&token, "rainy jazz night walk", None)
                .await
                .expect("search_tracks should succeed");
            let track = &search.tracks[1];
            println!("test track: id={} title={:?}", track.id, track.title);

            let like_result = client.like_track(&token, track.id).await;
            println!("like_track result: {like_result:?}");

            let unlike_result = client.unlike_track(&token, track.id).await;
            println!("unlike_track result: {unlike_result:?}");

            assert!(like_result.is_ok(), "like_track failed: {like_result:?}");
            assert!(
                unlike_result.is_ok(),
                "unlike_track failed: {unlike_result:?}"
            );
        });
    }

    /// Проверка десериализации `get_home_feed`/`resolve_tracks`/
    /// `get_playlist_track_ids` против настоящего ответа SoundCloud — форма
    /// `mixed-selections` подсмотрена через JS в браузере, а не по
    /// документации, стоит перепроверить структурой Rust-типов.
    ///
    /// Запуск: `cargo test --lib soundcloud::tests::probe_home_feed -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn probe_home_feed() {
        let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
        rt.block_on(async {
            let token = crate::auth::require_token()
                .expect("нет сохранённого токена — сначала войдите в настоящем приложении");
            let client = ScClient::new(Arc::new(crate::network::NetworkConfig::new()));

            let sections = client
                .get_home_feed(&token)
                .await
                .expect("get_home_feed should succeed");
            println!("sections: {}", sections.len());
            for section in &sections {
                println!(
                    "  {:?} — {} items (first: kind={:?} title={:?} trackCount={:?} trackIds={:?})",
                    section.title,
                    section.items.len(),
                    section.items.first().map(|i| &i.kind),
                    section.items.first().map(|i| &i.title),
                    section.items.first().map(|i| i.track_count),
                    section.items.first().and_then(|i| i.track_ids.as_ref().map(|v| v.len())),
                );
            }
            assert!(!sections.is_empty(), "mixed-selections вернул 0 разделов");

            let system_playlist = sections
                .iter()
                .flat_map(|s| &s.items)
                .find(|i| i.kind == "system-playlist" && i.track_ids.as_ref().is_some_and(|v| !v.is_empty()))
                .expect("должен найтись хотя бы один system-playlist с track_ids");
            let ids: Vec<i64> = system_playlist.track_ids.clone().unwrap();
            let resolved = client
                .resolve_tracks(&token, &ids[..ids.len().min(5)])
                .await
                .expect("resolve_tracks should succeed");
            println!(
                "resolved {} tracks from {:?}: {:?}",
                resolved.len(),
                system_playlist.title,
                resolved.iter().map(|t| &t.title).collect::<Vec<_>>()
            );
            assert!(!resolved.is_empty(), "resolve_tracks вернул 0 треков");

            let album = sections
                .iter()
                .flat_map(|s| &s.items)
                .find(|i| i.kind == "playlist")
                .expect("должен найтись хотя бы один обычный playlist/альбом");
            let album_id: i64 = album.id.parse().expect("id альбома должен быть числом");
            let album_track_ids = client
                .get_playlist_track_ids(&token, album_id)
                .await
                .expect("get_playlist_track_ids should succeed");
            println!(
                "album {:?} has {} track ids",
                album.title,
                album_track_ids.len()
            );
            assert!(
                !album_track_ids.is_empty(),
                "get_playlist_track_ids вернул 0 треков"
            );
        });
    }

    /// Разведка перед реализацией поиска по плейлистам (план, пункт 18):
    /// `/search/playlists` нигде не документирован, форма ответа не
    /// подтверждена — печатает сырой JSON первых двух элементов, чтобы
    /// свериться с реальными именами полей перед тем, как писать типизированный
    /// парсер (тот же метод, что и `probe_home_feed`/`probe_like_unlike`).
    ///
    /// Запуск: `cargo test --lib soundcloud::tests::probe_search_playlists -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn probe_search_playlists() {
        let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
        rt.block_on(async {
            let token = crate::auth::require_token()
                .expect("нет сохранённого токена — сначала войдите в настоящем приложении");
            let client = ScClient::new(Arc::new(crate::network::NetworkConfig::new()));

            let mut url = reqwest::Url::parse(&format!("{API_BASE}/search/playlists"))
                .expect("static base URL is valid");
            url.query_pairs_mut()
                .append_pair("q", "lofi hip hop")
                .append_pair("limit", "5");

            let raw: serde_json::Value = client
                .authed_get(url.as_str(), &token)
                .await
                .expect("GET /search/playlists should succeed");

            let collection = raw
                .get("collection")
                .and_then(|c| c.as_array())
                .expect("ответ должен содержать collection");
            println!("collection.len() = {}", collection.len());
            for item in collection.iter().take(2) {
                println!("{}", serde_json::to_string_pretty(item).unwrap());
            }
            println!("next_href = {:?}", raw.get("next_href"));

            assert!(!collection.is_empty(), "search/playlists вернул 0 элементов");
        });
    }

    /// Разведка перед страницей исполнителя (план, пункт 14): `/users/{id}`
    /// и `/users/{id}/tracks` нигде не документированы — печатает сырой
    /// JSON, чтобы свериться с реальными именами полей перед тем, как
    /// писать типизированный парсер (тот же метод, что и у остальных
    /// пробников). `user_id` берём из реального результата поиска треков —
    /// текущий типизированный `Track`/`RawUser` его не хранит.
    ///
    /// Запуск: `cargo test --lib soundcloud::tests::probe_user_profile -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn probe_user_profile() {
        let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
        rt.block_on(async {
            let token = crate::auth::require_token()
                .expect("нет сохранённого токена — сначала войдите в настоящем приложении");
            let client = ScClient::new(Arc::new(crate::network::NetworkConfig::new()));

            let mut search_url = reqwest::Url::parse(&format!("{API_BASE}/search/tracks"))
                .expect("static base URL is valid");
            search_url
                .query_pairs_mut()
                .append_pair("q", "rainy jazz night walk")
                .append_pair("limit", "1");
            let search: serde_json::Value = client
                .authed_get(search_url.as_str(), &token)
                .await
                .expect("search/tracks should succeed");
            let user_id = search["collection"][0]["user"]["id"]
                .as_i64()
                .expect("user.id должен быть в ответе поиска треков");
            println!("probing user_id={user_id}");

            let profile: serde_json::Value = client
                .authed_get(&format!("{API_BASE}/users/{user_id}"), &token)
                .await
                .expect("GET /users/{id} should succeed");
            println!("PROFILE:\n{}", serde_json::to_string_pretty(&profile).unwrap());

            let mut tracks_url =
                reqwest::Url::parse(&format!("{API_BASE}/users/{user_id}/tracks"))
                    .expect("static base URL is valid");
            tracks_url.query_pairs_mut().append_pair("limit", "5");
            let tracks: serde_json::Value = client
                .authed_get(tracks_url.as_str(), &token)
                .await
                .expect("GET /users/{id}/tracks should succeed");
            let collection = tracks
                .get("collection")
                .and_then(|c| c.as_array())
                .expect("ответ должен содержать collection");
            println!("tracks collection.len() = {}", collection.len());
            for item in collection.iter().take(2) {
                println!("{}", serde_json::to_string_pretty(item).unwrap());
            }
            println!("next_href = {:?}", tracks.get("next_href"));

            assert!(!collection.is_empty(), "users/{{id}}/tracks вернул 0 треков");

            let mut playlists_url =
                reqwest::Url::parse(&format!("{API_BASE}/users/{user_id}/playlists"))
                    .expect("static base URL is valid");
            playlists_url.query_pairs_mut().append_pair("limit", "5");
            let playlists: serde_json::Value = client
                .authed_get(playlists_url.as_str(), &token)
                .await
                .expect("GET /users/{id}/playlists should succeed");
            println!(
                "PLAYLISTS:\n{}",
                serde_json::to_string_pretty(&playlists).unwrap()
            );
        });
    }
}

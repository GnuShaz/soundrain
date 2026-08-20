//! Discord Rich Presence (план, пункт 17/21) — крейт `discord-rich-presence`
//! 1.1.0 (API сверена по исходникам `vionya/discord-rich-presence`, не
//! предположена): `DiscordIpcClient::new(id)` — не `Result`, конструктор не
//! может упасть сам по себе; `connect()` — уже `Result`, пробует именованные
//! пайпы `discord-ipc-0..9` на Windows и падает с ошибкой, если Discord не
//! запущен — это ожидаемый, не аварийный случай (не у всех пользователей
//! открыт Discord), поэтому просто тихо не показываем presence, а не роняем
//! приложение или спамим ошибками.
//!
//! Rust не решает, что показывать (никакой логики режима «Трек» / «Только
//! автора» / «Только активность» тут нет) — тот же принцип, что и у
//! `media::media_update`/трея: фронт (`lib/wire-discord.ts`) уже формирует
//! готовые строки под выбранный в настройках режим, Rust только передаёт их
//! в Discord IPC как есть.
//!
//! Свой Discord Application обязателен — Discord не выдаёт общий client_id
//! сторонним приложениям. Id — от пользователя, зашит константой (не
//! настройка пользователя, а параметр конкретного приложения).

use std::sync::mpsc::{self, Receiver, Sender};

use discord_rich_presence::activity::{Activity, ActivityType, Assets, Button, Timestamps};
use discord_rich_presence::{DiscordIpc, DiscordIpcClient};
use serde::Deserialize;
use tauri::State;

const CLIENT_ID: &str = "1539912207725240370";

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiscordPresence {
    pub details: Option<String>,
    pub state: Option<String>,
    pub large_image_url: Option<String>,
    pub button_label: Option<String>,
    pub button_url: Option<String>,
    /// Unix-время в мс — фронт присылает `None` для обоих полей на паузе
    /// (иначе полоска прогресса в Discord продолжала бы тикать, пока трек
    /// стоит на месте); при игре Discord сам рисует живой прогресс по этим
    /// двум точкам, повторно слать presence каждую секунду не нужно.
    pub start_timestamp_ms: Option<i64>,
    pub end_timestamp_ms: Option<i64>,
}

enum DiscordCmd {
    SetEnabled(bool),
    UpdatePresence(DiscordPresence),
    ClearPresence,
}

pub struct DiscordHandle {
    tx: Sender<DiscordCmd>,
}

pub fn spawn() -> DiscordHandle {
    let (tx, rx) = mpsc::channel::<DiscordCmd>();
    std::thread::spawn(move || discord_thread(rx));
    DiscordHandle { tx }
}

fn discord_thread(rx: Receiver<DiscordCmd>) {
    let mut client: Option<DiscordIpcClient> = None;
    let mut enabled = false;
    // Последнее присутствие — переприменяется, если Discord запустили уже
    // после включения тумблера (соединение появляется только на следующее
    // реальное событие: смену трека/паузы/настроек).
    let mut pending: Option<DiscordPresence> = None;

    for cmd in rx.iter() {
        match cmd {
            DiscordCmd::SetEnabled(value) => {
                enabled = value;
                if enabled {
                    ensure_connected(&mut client);
                    if let Some(presence) = pending.clone() {
                        apply(&mut client, &presence);
                    }
                } else if let Some(mut c) = client.take() {
                    let _ = c.close();
                }
            }
            DiscordCmd::UpdatePresence(presence) => {
                pending = Some(presence.clone());
                if enabled {
                    ensure_connected(&mut client);
                    apply(&mut client, &presence);
                }
            }
            DiscordCmd::ClearPresence => {
                pending = None;
                if let Some(c) = client.as_mut() {
                    let _ = c.clear_activity();
                }
            }
        }
    }
}

fn ensure_connected(client: &mut Option<DiscordIpcClient>) {
    if client.is_some() {
        return;
    }
    let mut new_client = DiscordIpcClient::new(CLIENT_ID);
    if new_client.connect().is_ok() {
        *client = Some(new_client);
    }
    // Discord не запущен — молча ждём следующего обновления, не спамим.
}

fn apply(client: &mut Option<DiscordIpcClient>, presence: &DiscordPresence) {
    let Some(c) = client.as_mut() else { return };

    let mut activity = Activity::new().activity_type(ActivityType::Listening);
    if let Some(details) = &presence.details {
        activity = activity.details(details.as_str());
    }
    if let Some(state) = &presence.state {
        activity = activity.state(state.as_str());
    }
    if let Some(image) = &presence.large_image_url {
        activity = activity.assets(Assets::new().large_image(image.as_str()));
    }
    if let (Some(label), Some(url)) = (&presence.button_label, &presence.button_url) {
        activity = activity.buttons(vec![Button::new(label.as_str(), url.as_str())]);
    }
    if let (Some(start), Some(end)) = (presence.start_timestamp_ms, presence.end_timestamp_ms) {
        activity = activity.timestamps(Timestamps::new().start(start).end(end));
    }

    if c.set_activity(activity).is_err() {
        // Пайп оборвался (Discord закрыли) — переподключимся на следующем обновлении.
        *client = None;
    }
}

#[tauri::command]
pub fn discord_set_enabled(enabled: bool, discord: State<'_, DiscordHandle>) {
    let _ = discord.tx.send(DiscordCmd::SetEnabled(enabled));
}

#[tauri::command]
pub fn discord_update_presence(presence: DiscordPresence, discord: State<'_, DiscordHandle>) {
    let _ = discord.tx.send(DiscordCmd::UpdatePresence(presence));
}

#[tauri::command]
pub fn discord_clear_presence(discord: State<'_, DiscordHandle>) {
    let _ = discord.tx.send(DiscordCmd::ClearPresence);
}

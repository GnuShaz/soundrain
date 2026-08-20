//! Локальный HTTP-сервер для OBS Browser Source — «Сейчас играет» поверх
//! стрима (план, пункт 19). OBS умеет открывать только настоящий `http://`
//! (не `tauri://`/кастомный протокол вебвью), поэтому лёгкий синхронный
//! `tiny_http` (без tokio, API сверена по исходникам `tiny-http/tiny-http`)
//! поднимается опционально, только пока виджет включён в настройках —
//! не занимает порт всё время работы приложения.
//!
//! Обновления — не SSE/WebSocket (оверкилл ради одного локального клиента),
//! а простой polling раз в секунду с самой страницы виджета: `GET
//! /now-playing` отдаёт тот же снимок, что уже есть для мини-плеера
//! (`media::MediaHandle::snapshot`), `GET /widget` — статическая
//! HTML/CSS/JS-страница (`widget.html`, вшита в бинарник `include_str!`).

use std::io::Cursor;
use std::net::TcpListener;
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::media::MediaHandle;

pub const DEFAULT_PORT: u16 = 47100;

const WIDGET_HTML: &str = include_str!("widget.html");

struct RunningServer {
    shutdown: Arc<std::sync::atomic::AtomicBool>,
    #[allow(dead_code)]
    thread: JoinHandle<()>,
}

pub struct WidgetServer {
    port: AtomicU16,
    running: Mutex<Option<RunningServer>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetStatus {
    pub enabled: bool,
    pub port: u16,
}

impl WidgetServer {
    pub fn new() -> Self {
        Self {
            port: AtomicU16::new(DEFAULT_PORT),
            running: Mutex::new(None),
        }
    }

    pub fn status(&self) -> WidgetStatus {
        WidgetStatus {
            enabled: self
                .running
                .lock()
                .expect("running lock не должен быть отравлен")
                .is_some(),
            port: self.port.load(Ordering::Relaxed),
        }
    }

    fn stop_locked(running: &mut Option<RunningServer>) {
        if let Some(server) = running.take() {
            // Не ждём join — поток сам заметит флаг внутри своего
            // `recv_timeout` (максимум ~200мс) и выйдет; блокировать
            // вызывающий поток (обработчик Tauri-команды) незачем.
            server.shutdown.store(true, Ordering::SeqCst);
        }
    }

    pub fn set_enabled(&self, app: &AppHandle, enabled: bool) -> Result<(), String> {
        let mut running = self
            .running
            .lock()
            .expect("running lock не должен быть отравлен");
        if enabled {
            if running.is_none() {
                let port = self.port.load(Ordering::Relaxed);
                *running = Some(start(app.clone(), port)?);
            }
        } else {
            Self::stop_locked(&mut running);
        }
        Ok(())
    }

    pub fn set_port(&self, app: &AppHandle, port: u16) -> Result<(), String> {
        let mut running = self
            .running
            .lock()
            .expect("running lock не должен быть отравлен");
        let was_enabled = running.is_some();
        Self::stop_locked(&mut running);
        self.port.store(port, Ordering::Relaxed);
        if was_enabled {
            *running = Some(start(app.clone(), port)?);
        }
        Ok(())
    }
}

fn start(app: AppHandle, port: u16) -> Result<RunningServer, String> {
    // Заранее проверяем, что порт свободен — иначе `tiny_http` просто не
    // запустится и понять, почему виджет "не работает", без этой проверки
    // сложнее, чем прочитать понятную ошибку сразу в настройках.
    TcpListener::bind(("127.0.0.1", port))
        .map_err(|e| format!("порт {port} занят или недоступен: {e}"))?;

    let server = tiny_http::Server::http(("127.0.0.1", port))
        .map_err(|e| format!("не удалось запустить сервер виджета: {e}"))?;

    let shutdown = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let shutdown_for_thread = shutdown.clone();

    let thread = std::thread::spawn(move || {
        while !shutdown_for_thread.load(Ordering::SeqCst) {
            match server.recv_timeout(Duration::from_millis(200)) {
                Ok(Some(request)) => handle_request(&app, request),
                Ok(None) => {}
                Err(_) => break,
            }
        }
    });

    Ok(RunningServer { shutdown, thread })
}

fn handle_request(app: &AppHandle, request: tiny_http::Request) {
    let response = match request.url() {
        "/" | "/widget" => html_response(WIDGET_HTML),
        // `try_state` — не `state`: если медиа-контролы ОС не поднялись
        // (`media::init` вернул `Err`, см. `lib.rs`), `MediaHandle` вообще
        // не managed, а `state::<T>()` в этом случае паникует.
        "/now-playing" => json_response(
            &app.try_state::<MediaHandle>()
                .and_then(|handle| handle.snapshot()),
        ),
        _ => not_found_response(),
    };
    let _ = request.respond(response);
}

fn html_response(html: &str) -> tiny_http::Response<Cursor<Vec<u8>>> {
    let header =
        tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..])
            .expect("static header is valid ASCII");
    tiny_http::Response::from_string(html).with_header(header)
}

fn json_response<T: Serialize>(value: &T) -> tiny_http::Response<Cursor<Vec<u8>>> {
    let body = serde_json::to_string(value).unwrap_or_else(|_| "null".to_string());
    let header = tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..])
        .expect("static header is valid ASCII");
    tiny_http::Response::from_string(body).with_header(header)
}

fn not_found_response() -> tiny_http::Response<Cursor<Vec<u8>>> {
    tiny_http::Response::from_string("not found").with_status_code(404u16)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpStream;

    fn raw_get(port: u16, path: &str) -> (u16, String) {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("connect should succeed");
        write!(
            stream,
            "GET {path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n"
        )
        .unwrap();
        let mut buf = String::new();
        stream.read_to_string(&mut buf).unwrap();
        let status = buf
            .lines()
            .next()
            .and_then(|line| line.split_whitespace().nth(1))
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        let body = buf.split("\r\n\r\n").nth(1).unwrap_or("").to_string();
        (status, body)
    }

    /// Проверяет реальный обмен по сокету (bind → accept → respond) —
    /// именно здесь легче всего ошибиться в API `tiny_http`, который в этом
    /// проекте раньше не использовался и не проверялся. `/now-playing`
    /// (единственный путь, которому реально нужен `AppHandle` настоящего
    /// Tauri-приложения) здесь не проверяется — генерализировать весь модуль
    /// под рантайм ради одного теста того не стоит; сам `json_response`
    /// проверен на месте третьей веткой без похода в `MediaHandle`.
    ///
    /// Запуск: `cargo test --lib widget::tests::serves_html_json_and_404`
    #[test]
    fn serves_html_json_and_404() {
        let port = 47355; // фиксированный тестовый порт, отличный от DEFAULT_PORT
        let server = tiny_http::Server::http(("127.0.0.1", port)).expect("bind should succeed");

        let handle = std::thread::spawn(move || {
            for _ in 0..3 {
                let request = server.recv().expect("recv should succeed");
                let response = match request.url() {
                    "/widget" => html_response(WIDGET_HTML),
                    "/now-playing-probe" => json_response(&Some(42)),
                    _ => not_found_response(),
                };
                let _ = request.respond(response);
            }
        });

        let (status, body) = raw_get(port, "/widget");
        assert_eq!(status, 200);
        assert!(body.contains("SoundRain"));

        let (status, body) = raw_get(port, "/now-playing-probe");
        assert_eq!(status, 200);
        assert_eq!(body.trim(), "42");

        let (status, _) = raw_get(port, "/unknown");
        assert_eq!(status, 404);

        handle.join().unwrap();
    }
}

#[tauri::command]
pub fn widget_get_status(widget: State<'_, WidgetServer>) -> WidgetStatus {
    widget.status()
}

#[tauri::command]
pub fn widget_set_enabled(
    enabled: bool,
    app: AppHandle,
    widget: State<'_, WidgetServer>,
) -> Result<(), String> {
    widget.set_enabled(&app, enabled)
}

#[tauri::command]
pub fn widget_set_port(
    port: u16,
    app: AppHandle,
    widget: State<'_, WidgetServer>,
) -> Result<(), String> {
    widget.set_port(&app, port)
}

//! Персистентный дисковый кэш аудио — вместо временного файла, который
//! раньше скачивался и удалялся при каждом переключении трека. Ключ — id
//! трека; повторное проигрывание уже закэшированного трека (в том числе
//! после prefetch следующего трека в очереди) стартует без похода в сеть.
//!
//! LRU по времени последнего доступа: при превышении лимита старые файлы
//! удаляются первыми. Ограничение — только на суммарный размер, без учёта
//! отдельного «защищённого» кэша лайков (это часть экрана настроек
//! «Хранилище», см. план — сюда пока не реализовано).

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::SystemTime;

use serde::Serialize;
use tauri::State;

const DEFAULT_LIMIT_BYTES: u64 = 1024 * 1024 * 1024; // 1 GB — совпадает со значением по умолчанию в референсе настроек

pub struct AudioCache {
    dir: PathBuf,
    limit_bytes: AtomicU64,
}

impl AudioCache {
    pub fn new(dir: PathBuf) -> Self {
        let _ = fs::create_dir_all(&dir);
        Self {
            dir,
            limit_bytes: AtomicU64::new(DEFAULT_LIMIT_BYTES),
        }
    }

    pub fn dir(&self) -> &std::path::Path {
        &self.dir
    }

    pub fn path_for(&self, track_id: i64) -> PathBuf {
        self.dir.join(format!("{track_id}.mp3"))
    }

    /// Есть ли трек уже на диске — если да, обновляет время доступа (для
    /// LRU) и отдаёт путь без похода в сеть.
    pub fn get(&self, track_id: i64) -> Option<PathBuf> {
        let path = self.path_for(track_id);
        if path.exists() {
            touch(&path);
            Some(path)
        } else {
            None
        }
    }

    pub fn limit_bytes(&self) -> u64 {
        self.limit_bytes.load(Ordering::Relaxed)
    }

    pub fn set_limit_bytes(&self, bytes: u64) {
        self.limit_bytes.store(bytes, Ordering::Relaxed);
        self.evict();
    }

    /// Суммарный размер файлов в кэше — для карточки «Аудио» в настройках,
    /// раздел «Хранилище» (см. план, пункт 15).
    pub fn total_bytes(&self) -> u64 {
        let Ok(entries) = fs::read_dir(&self.dir) else {
            return 0;
        };
        entries
            .filter_map(|e| e.ok())
            .filter_map(|e| e.metadata().ok())
            .filter(|meta| meta.is_file())
            .map(|meta| meta.len())
            .sum()
    }

    /// Полностью очищает кэш по кнопке — в отличие от `evict()`, не
    /// оглядывается на лимит.
    pub fn clear(&self) {
        let Ok(entries) = fs::read_dir(&self.dir) else {
            return;
        };
        for entry in entries.filter_map(|e| e.ok()) {
            if entry.metadata().is_ok_and(|m| m.is_file()) {
                let _ = fs::remove_file(entry.path());
            }
        }
    }

    /// Удаляет наименее недавно использованные файлы, пока суммарный размер
    /// не уложится в лимит.
    pub fn evict(&self) {
        let limit = self.limit_bytes.load(Ordering::Relaxed);
        let Ok(entries) = fs::read_dir(&self.dir) else {
            return;
        };

        let mut files: Vec<(PathBuf, u64, SystemTime)> = entries
            .filter_map(|e| e.ok())
            .filter_map(|entry| {
                let meta = entry.metadata().ok()?;
                if !meta.is_file() {
                    return None;
                }
                let accessed = meta
                    .modified()
                    .or_else(|_| meta.accessed())
                    .unwrap_or(SystemTime::UNIX_EPOCH);
                Some((entry.path(), meta.len(), accessed))
            })
            .collect();

        let mut total: u64 = files.iter().map(|(_, size, _)| size).sum();
        if total <= limit {
            return;
        }

        files.sort_by_key(|(_, _, accessed)| *accessed);
        for (path, size, _) in files {
            if total <= limit {
                break;
            }
            if fs::remove_file(&path).is_ok() {
                total = total.saturating_sub(size);
            }
        }
    }
}

/// Обновляет mtime файла, чтобы LRU видел трек свежепрослушанным — Windows
/// не всегда обновляет atime на обычное открытие/чтение файла.
fn touch(path: &std::path::Path) {
    if let Ok(file) = fs::File::open(path) {
        let _ = file.set_modified(SystemTime::now());
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheStats {
    pub audio_bytes: u64,
    pub audio_limit_bytes: u64,
}

#[tauri::command]
pub fn cache_get_stats(cache: State<'_, AudioCache>) -> CacheStats {
    CacheStats {
        audio_bytes: cache.total_bytes(),
        audio_limit_bytes: cache.limit_bytes(),
    }
}

#[tauri::command]
pub fn cache_clear_audio(cache: State<'_, AudioCache>) {
    cache.clear();
}

#[tauri::command]
pub fn cache_set_audio_limit(bytes: u64, cache: State<'_, AudioCache>) {
    cache.set_limit_bytes(bytes);
}

//! Помощь с настройкой [Flowseal/zapret-discord-youtube](https://github.com/Flowseal/zapret-discord-youtube)
//! (MIT) — не прокси, а системный DPI-обход через драйвер WinDivert,
//! работает прозрачно для всех процессов на машине, если нужные домены
//! есть в его пользовательском хостлисте. Не проксируем через него сами —
//! только дописываем домены в файл, который сам zapret уже читает.
//!
//! Формат и расположение проверены по исходникам репозитория (`general.bat`,
//! `service.bat`), не предположены: `.bat`-лаунчеры лежат в корне репозитория
//! рядом с папкой `lists/`, каждый строит `LISTS=%~dp0lists\` и передаёт
//! `--hostlist="%LISTS%list-general-user.txt"` в `winws.exe`. Сам файл
//! появляется не сразу — `service.bat` создаёт его при первом запуске с
//! плейсхолдером (`# Never leave this file empty` + `domain.example.abc`),
//! если его ещё нет; формат — один домен на строке, `#` — комментарий.

use std::collections::HashSet;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::Serialize;

/// Только корневые домены — так же устроен и сам `list-general.txt`
/// (например `discord.com` без отдельной строки на каждый поддомен вроде
/// `gateway.discord.gg`): zapret/nfqws сравнивает хост по суффиксу, поэтому
/// одной строки `sndcdn.com` достаточно на все `*.sndcdn.com` (CDN обложек,
/// `a-v2.sndcdn.com` со скриптами клиента, `cf-media.sndcdn.com` с самим
/// аудио) — проверено по реальным хостам, с которыми работает клиент этого
/// приложения (`soundcloud/mod.rs`, `audio/mod.rs`).
const SOUNDCLOUD_DOMAINS: [&str; 2] = ["soundcloud.com", "sndcdn.com"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZapretResult {
    pub added: Vec<String>,
    pub already_present: Vec<String>,
}

fn resolve_list_path(bat_path: &Path) -> Result<PathBuf, String> {
    let dir = bat_path
        .parent()
        .ok_or_else(|| "не удалось определить папку рядом с выбранным файлом".to_string())?;
    let lists_dir = dir.join("lists");
    if !lists_dir.is_dir() {
        return Err(
            "рядом с выбранным файлом нет папки \"lists\" — похоже, это не launcher zapret"
                .to_string(),
        );
    }
    Ok(lists_dir.join("list-general-user.txt"))
}

#[tauri::command]
pub fn zapret_add_soundcloud_domains(bat_path: String) -> Result<ZapretResult, String> {
    let list_path = resolve_list_path(Path::new(&bat_path))?;

    let existing = if list_path.exists() {
        std::fs::read_to_string(&list_path).map_err(|e| e.to_string())?
    } else {
        String::new()
    };
    let existing_domains: HashSet<&str> = existing
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .collect();

    let mut added = Vec::new();
    let mut already_present = Vec::new();
    let mut to_append = String::new();
    for domain in SOUNDCLOUD_DOMAINS {
        if existing_domains.contains(domain) {
            already_present.push(domain.to_string());
        } else {
            to_append.push_str(domain);
            to_append.push('\n');
            added.push(domain.to_string());
        }
    }

    if !to_append.is_empty() {
        // Не задеваем уже написанные строки (плейсхолдер zapret или чужие
        // домены пользователя) — только дописываем в конец файла.
        let needs_leading_newline = !existing.is_empty() && !existing.ends_with('\n');
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&list_path)
            .map_err(|e| e.to_string())?;
        if needs_leading_newline {
            file.write_all(b"\n").map_err(|e| e.to_string())?;
        }
        file.write_all(to_append.as_bytes())
            .map_err(|e| e.to_string())?;
    }

    Ok(ZapretResult {
        added,
        already_present,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Реального zapret под рукой нет, поэтому саму DPI-часть проверить
    /// нельзя — но чтение/парсинг/дозапись файла (то, за что реально
    /// отвечает наш код) проверяется изолированно, на подставной структуре
    /// папок, повторяющей реальную (`<bat>` рядом с `lists/`).
    #[test]
    fn creates_list_file_when_missing() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("lists")).unwrap();
        let bat_path = dir.path().join("general.bat");

        let result = zapret_add_soundcloud_domains(bat_path.to_string_lossy().to_string())
            .expect("should succeed");
        assert_eq!(result.added, vec!["soundcloud.com", "sndcdn.com"]);
        assert!(result.already_present.is_empty());

        let content = std::fs::read_to_string(dir.path().join("lists/list-general-user.txt"))
            .expect("file should exist");
        assert!(content.contains("soundcloud.com"));
        assert!(content.contains("sndcdn.com"));
    }

    #[test]
    fn skips_domains_already_present_and_preserves_existing_lines() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("lists")).unwrap();
        std::fs::write(
            dir.path().join("lists/list-general-user.txt"),
            "# Never leave this file empty\nsoundcloud.com\n",
        )
        .unwrap();
        let bat_path = dir.path().join("general.bat");

        let result = zapret_add_soundcloud_domains(bat_path.to_string_lossy().to_string())
            .expect("should succeed");
        assert_eq!(result.added, vec!["sndcdn.com"]);
        assert_eq!(result.already_present, vec!["soundcloud.com"]);

        let content = std::fs::read_to_string(dir.path().join("lists/list-general-user.txt"))
            .expect("file should exist");
        assert!(content.contains("# Never leave this file empty"));
        assert_eq!(content.matches("soundcloud.com").count(), 1);
        assert!(content.contains("sndcdn.com"));
    }

    #[test]
    fn rerun_is_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("lists")).unwrap();
        let bat_path = dir.path().join("general.bat");
        let bat_path_str = bat_path.to_string_lossy().to_string();

        zapret_add_soundcloud_domains(bat_path_str.clone()).expect("first run should succeed");
        let second = zapret_add_soundcloud_domains(bat_path_str).expect("second run should succeed");

        assert!(second.added.is_empty());
        assert_eq!(second.already_present.len(), 2);
    }

    #[test]
    fn errors_when_no_lists_folder_next_to_bat() {
        let dir = tempfile::tempdir().unwrap();
        let bat_path = dir.path().join("general.bat");

        let err = zapret_add_soundcloud_domains(bat_path.to_string_lossy().to_string())
            .expect_err("should fail without a lists/ folder");
        assert!(err.contains("lists"));
    }
}

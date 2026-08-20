//! Тонкая прослойка поверх Windows Credential Manager напрямую через Win32,
//! в обход крейта `keyring` v3.
//!
//! Причина: `keyring` v3 на Windows жёстко использует `CRED_PERSIST_ENTERPRISE`
//! без возможности переключить (не параметризуется через публичный API).
//! На обычной (не доменной) Windows-машине с Microsoft-аккаунтом такой
//! credential пишется без ошибки (`CredWriteW` возвращает успех), но затем
//! не находится при чтении (`CredReadW` -> `ERROR_NOT_FOUND`) — проверено
//! вживую отдельным пробником, воспроизводится даже в рамках одного процесса
//! сразу после записи. `CRED_PERSIST_LOCAL_MACHINE` работает предсказуемо.

use std::iter::once;

use windows_sys::Win32::Foundation::GetLastError;
use windows_sys::Win32::Security::Credentials::{
    CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC, CREDENTIALW, CredDeleteW, CredFree, CredReadW,
    CredWriteW,
};

fn target_name(service: &str, account: &str) -> String {
    format!("{account}.{service}")
}

fn to_wstr(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(once(0)).collect()
}

pub fn write(service: &str, account: &str, password: &str) -> Result<(), String> {
    let mut target = to_wstr(&target_name(service, account));
    let mut username = to_wstr(account);
    let mut blob: Vec<u8> = password
        .encode_utf16()
        .flat_map(|unit| unit.to_le_bytes())
        .collect();

    let credential = CREDENTIALW {
        Flags: 0,
        Type: CRED_TYPE_GENERIC,
        TargetName: target.as_mut_ptr(),
        Comment: std::ptr::null_mut(),
        LastWritten: unsafe { std::mem::zeroed() },
        CredentialBlobSize: blob.len() as u32,
        CredentialBlob: blob.as_mut_ptr(),
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        AttributeCount: 0,
        Attributes: std::ptr::null_mut(),
        TargetAlias: std::ptr::null_mut(),
        UserName: username.as_mut_ptr(),
    };

    let ok = unsafe { CredWriteW(&credential, 0) };
    blob.fill(0);
    if ok == 0 {
        return Err(format!(
            "CredWriteW не сработал, код ошибки {}",
            unsafe { GetLastError() }
        ));
    }
    Ok(())
}

pub fn read(service: &str, account: &str) -> Option<String> {
    let target = to_wstr(&target_name(service, account));
    let mut p_credential: *mut CREDENTIALW = std::ptr::null_mut();
    let ok = unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut p_credential) };
    if ok == 0 {
        return None;
    }

    let password = unsafe {
        let cred = &*p_credential;
        let len = cred.CredentialBlobSize as usize;
        if len == 0 || len % 2 != 0 {
            None
        } else {
            let bytes = std::slice::from_raw_parts(cred.CredentialBlob, len);
            let units: Vec<u16> = bytes
                .chunks_exact(2)
                .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
                .collect();
            String::from_utf16(&units).ok()
        }
    };
    unsafe { CredFree(p_credential as *const _) };
    password
}

pub fn delete(service: &str, account: &str) {
    let target = to_wstr(&target_name(service, account));
    unsafe {
        CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Регрессионный тест на баг с `keyring` v3: запись должна быть видна
    /// при чтении сразу же, в рамках одного процесса.
    #[test]
    fn write_then_read_round_trips() {
        let service = "soundrain-selftest";
        let account = "round-trip-probe";
        write(service, account, "probe-value").expect("write should succeed");
        let read_back = read(service, account);
        delete(service, account);
        assert_eq!(read_back.as_deref(), Some("probe-value"));
    }
}

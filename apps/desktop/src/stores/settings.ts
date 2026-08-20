import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "../lib/api";

export type DiscordMode = "track" | "artist" | "activity";

/**
 * Собственный прокси на VPS проекта, включён по умолчанию — чтобы у
 * пользователей из РФ (SoundCloud заблокирован) всё работало без настройки.
 * Тот же принцип, что и у Discord client_id/API-ключа бэкенда: не секрет
 * уровня пользовательских данных, общий креденшл сервиса. Должен совпадать с
 * `DEFAULT_PROXY_URL` в `src-tauri/src/network/mod.rs` — Rust стартует с этим
 * же значением, так что до первой гидратации стора (мгновенно, localStorage
 * синхронный) поведение уже консистентно.
 */
export const DEFAULT_PROXY_URL = "http://sr_iNlJ1RoP:HTSs4M0zRjYSaiwmuDg0snCx@31.76.20.177:18080";

interface SettingsState {
  /** `null` — системное устройство по умолчанию. */
  audioDeviceId: string | null;
  setAudioDeviceId: (id: string | null) => void;
  /** По умолчанию — {@link DEFAULT_PROXY_URL}, `null` — прямое соединение. */
  proxyUrl: string | null;
  setProxyUrl: (url: string | null) => void;
  /**
   * Только для удобства UI («Повторить» без повторного выбора файла) — сам
   * zapret ничего не знает о нашем приложении, Rust ничего с этим путём при
   * старте не делает.
   */
  zapretBatPath: string | null;
  setZapretBatPath: (path: string | null) => void;

  discordEnabled: boolean;
  setDiscordEnabled: (enabled: boolean) => void;
  discordMode: DiscordMode;
  setDiscordMode: (mode: DiscordMode) => void;
  discordButtonEnabled: boolean;
  setDiscordButtonEnabled: (enabled: boolean) => void;
}

/**
 * localStorage, не бэкенд — все настройки здесь привязаны к конкретной
 * машине/запуску приложения, синхронизировать их через Postgres между
 * машинами было бы просто неверно семантически (тот же принцип, что уже
 * применён в `stores/equalizer.ts`). При старте Rust всегда открывает
 * системное аудиоустройство, работает без прокси и без Discord Presence —
 * `onRehydrateStorage` дошлёт сохранённые значения, только если они
 * отличаются от значения по умолчанию.
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      audioDeviceId: null,
      setAudioDeviceId: (id) => {
        set({ audioDeviceId: id });
        api.audioSetDevice(id).catch(() => {});
      },

      proxyUrl: DEFAULT_PROXY_URL,
      setProxyUrl: (url) => {
        set({ proxyUrl: url });
        api.networkSetProxy(url).catch(() => {});
      },

      zapretBatPath: null,
      setZapretBatPath: (path) => set({ zapretBatPath: path }),

      discordEnabled: false,
      setDiscordEnabled: (enabled) => {
        set({ discordEnabled: enabled });
        api.discordSetEnabled(enabled).catch(() => {});
      },
      discordMode: "track",
      setDiscordMode: (mode) => set({ discordMode: mode }),
      discordButtonEnabled: true,
      setDiscordButtonEnabled: (enabled) => set({ discordButtonEnabled: enabled }),
    }),
    {
      name: "soundrain-settings",
      onRehydrateStorage: () => (state) => {
        if (state?.audioDeviceId) {
          api.audioSetDevice(state.audioDeviceId).catch(() => {});
        }
        // Без условия на truthy: Rust стартует с DEFAULT_PROXY_URL по
        // умолчанию, так что явный выбор пользователя "Напрямую" (null)
        // тоже обязательно нужно дослать — иначе Rust продолжит работать
        // через прокси, хотя пользователь выбрал прямое соединение.
        if (state) {
          api.networkSetProxy(state.proxyUrl).catch(() => {});
        }
        if (state?.discordEnabled) {
          api.discordSetEnabled(true).catch(() => {});
        }
      },
    },
  ),
);

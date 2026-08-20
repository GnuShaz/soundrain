import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "../lib/api";

export type DiscordMode = "track" | "artist" | "activity";

interface SettingsState {
  /** `null` — системное устройство по умолчанию. */
  audioDeviceId: string | null;
  setAudioDeviceId: (id: string | null) => void;
  /** `null` — прямое соединение, без прокси. */
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

      proxyUrl: null,
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
        if (state?.proxyUrl) {
          api.networkSetProxy(state.proxyUrl).catch(() => {});
        }
        if (state?.discordEnabled) {
          api.discordSetEnabled(true).catch(() => {});
        }
      },
    },
  ),
);

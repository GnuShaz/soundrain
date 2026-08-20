import { create } from "zustand";
import { api, isScError, type Track } from "../lib/api";
import { pushDiscordPresence } from "../lib/wire-discord";

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";

// Момент последнего ручного sook — не часть стора (не нужен реактивный
// рендер), но нужен wire-player-events.ts, чтобы гасить audio:tick сразу
// после сика. rodio не гарантирует, что `get_pos()` отражает новую позицию
// в тот же 100-мс тик, что и обработанный `try_seek`; без защитного окна
// один-единственный "ещё не устаканившийся" тик визуально отбрасывает
// перемотку назад туда, откуда мотали.
let lastManualSeekAt = 0;
export function getLastManualSeekAt(): number {
  return lastManualSeekAt;
}

interface PlayerState {
  currentTrack: Track | null;
  status: PlayerStatus;
  positionSecs: number;
  durationSecs: number;
  volume: number;
  errorMessage: string | null;
  /** Звук rodio реально загружен под currentTrack — false после hydrate(). */
  loaded: boolean;
  play: (track: Track, startPositionSecs?: number) => Promise<void>;
  toggle: () => void;
  seek: (positionSecs: number) => void;
  setVolume: (volume: number) => void;
  /** Восстановление состояния при старте приложения — без обращения к rodio. */
  hydrate: (track: Track, positionSecs: number, volume: number) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  status: "idle",
  positionSecs: 0,
  durationSecs: 0,
  volume: 1,
  errorMessage: null,
  loaded: false,

  play: async (track, startPositionSecs) => {
    // Останавливаем звук сразу, не дожидаясь резолва потока/докачки нового
    // трека — иначе старый трек продолжает играть все время загрузки.
    api.audioStop();
    set({
      currentTrack: track,
      status: "loading",
      positionSecs: startPositionSecs ?? 0,
      durationSecs: track.durationMs / 1000,
      errorMessage: null,
      loaded: false,
    });
    try {
      const stream = await api.scTrackStream(track.id);
      await api.audioLoadUrl(track.id, stream.url);
      if (startPositionSecs) {
        await api.audioSeek(startPositionSecs);
      }
      await api.audioSetVolume(get().volume);
      await api.audioPlay();
      set({ status: "playing", durationSecs: stream.durationMs / 1000, loaded: true });
    } catch (e) {
      const message = isScError(e)
        ? e.kind === "network"
          ? e.message
          : "SoundCloud отклонил запрос"
        : "не удалось воспроизвести трек";
      set({ status: "error", errorMessage: message });
    }
  },

  toggle: () => {
    const { status, loaded, currentTrack, positionSecs } = get();
    if (status === "playing") {
      api.audioPause();
      set({ status: "paused" });
    } else if (status === "paused") {
      if (!loaded && currentTrack) {
        get().play(currentTrack, positionSecs);
      } else {
        api.audioPlay();
        set({ status: "playing" });
      }
    }
  },

  seek: (positionSecs) => {
    lastManualSeekAt = Date.now();
    api.audioSeek(positionSecs);
    set({ positionSecs });
    // Discord считает прогресс сам от переданной точки старта — без этого
    // после ручной перемотки полоска в статусе продолжала бы тикать от
    // старой позиции до следующей смены трека/паузы.
    pushDiscordPresence();
  },

  setVolume: (volume) => {
    api.audioSetVolume(volume);
    set({ volume });
  },

  hydrate: (track, positionSecs, volume) => {
    set({
      currentTrack: track,
      status: "paused",
      positionSecs,
      durationSecs: track.durationMs / 1000,
      volume,
      errorMessage: null,
      loaded: false,
    });
  },
}));

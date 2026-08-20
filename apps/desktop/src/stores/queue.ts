import { create } from "zustand";
import type { Track } from "../lib/api";
import { usePlayerStore } from "./player";

interface QueueState {
  items: Track[];
  currentIndex: number | null;
  /** «Играть отсюда»: очередь = список целиком, старт с кликнутого трека. */
  playFrom: (tracks: Track[], startIndex: number) => void;
  next: () => void;
  prev: () => void;
  /** Восстановление очереди при старте приложения — без запуска воспроизведения. */
  hydrate: (tracks: Track[], currentIndex: number | null) => void;
}

export const useQueueStore = create<QueueState>((set, get) => ({
  items: [],
  currentIndex: null,

  playFrom: (tracks, startIndex) => {
    set({ items: tracks, currentIndex: startIndex });
    usePlayerStore.getState().play(tracks[startIndex]);
  },

  next: () => {
    const { items, currentIndex } = get();
    if (currentIndex === null) return;
    const nextIndex = currentIndex + 1;
    if (nextIndex >= items.length) {
      set({ currentIndex: null });
      usePlayerStore.setState({ status: "idle", currentTrack: null, positionSecs: 0 });
      return;
    }
    set({ currentIndex: nextIndex });
    usePlayerStore.getState().play(items[nextIndex]);
  },

  prev: () => {
    const { items, currentIndex } = get();
    if (currentIndex === null || currentIndex === 0) return;
    const prevIndex = currentIndex - 1;
    set({ currentIndex: prevIndex });
    usePlayerStore.getState().play(items[prevIndex]);
  },

  hydrate: (tracks, currentIndex) => {
    set({ items: tracks, currentIndex });
  },
}));

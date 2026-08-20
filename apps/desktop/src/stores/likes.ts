import { create } from "zustand";
import type { Track } from "../lib/api";
import { backendApi, type UserIdentity } from "../lib/backend-api";

interface LikesState {
  likedIds: Set<number>;
  pendingIds: Set<number>;
  isLiked: (id: number) => boolean;
  isPending: (id: number) => boolean;
  hydrate: (ids: number[]) => void;
  mergeKnown: (ids: number[]) => void;
  toggle: (identity: UserIdentity, track: Track) => Promise<void>;
}

export const useLikesStore = create<LikesState>((set, get) => ({
  likedIds: new Set(),
  pendingIds: new Set(),

  isLiked: (id) => get().likedIds.has(id),
  isPending: (id) => get().pendingIds.has(id),

  hydrate: (ids) => set({ likedIds: new Set(ids) }),

  mergeKnown: (ids) => set((state) => ({ likedIds: new Set([...state.likedIds, ...ids]) })),

  toggle: async (identity, track) => {
    const { likedIds, pendingIds } = get();
    if (pendingIds.has(track.id)) return;
    const wasLiked = likedIds.has(track.id);

    const optimistic = new Set(likedIds);
    if (wasLiked) optimistic.delete(track.id);
    else optimistic.add(track.id);
    set({ likedIds: optimistic, pendingIds: new Set(pendingIds).add(track.id) });

    try {
      // Лайки — на уровне пользователя нашего приложения, не синхронизируются
      // с настоящим SoundCloud-аккаунтом: их API мутации (like/unlike)
      // блокирует запросы не из настоящего браузера (see план, шаг 6).
      if (wasLiked) {
        await backendApi.removeLike(identity.scUserId, String(track.id));
      } else {
        await backendApi.setLike(identity, track);
      }
    } catch {
      // Наш бэкенд недоступен — откатываем оптимистичное изменение.
      set((state) => {
        const rollback = new Set(state.likedIds);
        if (wasLiked) rollback.add(track.id);
        else rollback.delete(track.id);
        return { likedIds: rollback };
      });
    } finally {
      set((state) => {
        const next = new Set(state.pendingIds);
        next.delete(track.id);
        return { pendingIds: next };
      });
    }
  },
}));

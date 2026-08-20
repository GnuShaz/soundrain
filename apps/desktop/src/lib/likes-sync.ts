import { useLikesStore } from "../stores/likes";
import type { ScUser, Track } from "./api";
import { backendApi, toIdentity, type UserIdentity } from "./backend-api";

let currentIdentity: UserIdentity | null = null;

/** Быстрое восстановление лайков из локального кэша бэкенда при старте. */
export async function hydrateLikesFromBackend(user: ScUser) {
  currentIdentity = toIdentity(user);
  const { items } = await backendApi
    .getLikes(currentIdentity.scUserId)
    .catch(() => ({ items: [] as Track[] }));
  useLikesStore.getState().hydrate(items.map((track) => track.id));
}

/**
 * Клик по сердечку из любого списка (лента/лайки/поиск) — не требует
 * прокидывать identity через пропсы каждого TrackRow.
 */
export function toggleLike(track: Track) {
  if (!currentIdentity) return;
  useLikesStore.getState().toggle(currentIdentity, track);
}

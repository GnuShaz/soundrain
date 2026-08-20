import { useQueueStore } from "../stores/queue";
import { api } from "./api";

let wired = false;
let lastPrefetchedTrackId: number | null = null;

/**
 * Пока играет текущий трек, докачиваем в кэш следующий из очереди — к
 * моменту нажатия «следующий» он уже на диске, переключение мгновенное.
 * Сам кэш персистентный (см. Rust `cache` модуль), поэтому «назад» тоже
 * бесплатный — трек уже скачан с первого проигрывания.
 */
export function wirePrefetch() {
  if (wired) return;
  wired = true;

  useQueueStore.subscribe((state) => {
    if (state.currentIndex === null) return;
    const next = state.items[state.currentIndex + 1];
    if (!next || next.id === lastPrefetchedTrackId) return;
    lastPrefetchedTrackId = next.id;

    api
      .scTrackStream(next.id)
      .then((stream) => api.audioPrefetch(next.id, stream.url))
      .catch(() => {});
  });
}

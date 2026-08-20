import { type PlayerStatus, usePlayerStore } from "../stores/player";
import { useQueueStore } from "../stores/queue";
import type { ScUser, Track } from "./api";
import { backendApi, toIdentity } from "./backend-api";

let wired = false;

/**
 * Восстановление очереди и позиции воспроизведения из бэкенда при старте
 * приложения. Не трогает rodio — только заполняет сторы, реальная загрузка
 * звука откладывается до первого нажатия play (см. player.hydrate/toggle).
 */
export async function hydrateFromBackend(user: ScUser) {
  const identity = toIdentity(user);
  const [queue, playback] = await Promise.all([
    backendApi.getQueue(identity.scUserId).catch(() => ({ items: [] as Track[] })),
    backendApi.getPlaybackState(identity.scUserId).catch(() => null),
  ]);

  const currentIndex = playback?.currentTrack
    ? queue.items.findIndex((track) => track.id === playback.currentTrack?.id)
    : -1;
  useQueueStore.getState().hydrate(queue.items, currentIndex >= 0 ? currentIndex : null);

  if (playback?.currentTrack) {
    usePlayerStore
      .getState()
      .hydrate(playback.currentTrack, playback.positionSecs, playback.volume);
  } else if (playback) {
    usePlayerStore.setState({ volume: playback.volume });
  }
}

/**
 * Сохранение очереди/позиции в бэкенд при изменениях. Вызывать один раз,
 * ПОСЛЕ hydrateFromBackend — иначе сама гидратация тут же уйдёт обратно в PUT.
 */
export function wireBackendPersistence(user: ScUser) {
  if (wired) return;
  wired = true;
  const identity = toIdentity(user);

  useQueueStore.subscribe((state) => {
    backendApi.replaceQueue(identity, state.items).catch(() => {});
  });

  const savePlayback = () => {
    const state = usePlayerStore.getState();
    if (!state.currentTrack) return;
    backendApi
      .savePlaybackState(identity, {
        currentTrack: state.currentTrack,
        positionSecs: state.positionSecs,
        volume: state.volume,
      })
      .catch(() => {});
  };

  let lastTrackId: number | null = usePlayerStore.getState().currentTrack?.id ?? null;
  let lastStatus: PlayerStatus | null = null;
  usePlayerStore.subscribe((state) => {
    const trackChanged = state.currentTrack?.id !== lastTrackId;
    const justPaused = state.status === "paused" && lastStatus !== "paused";
    lastTrackId = state.currentTrack?.id ?? null;
    lastStatus = state.status;
    if (trackChanged || justPaused) savePlayback();
  });

  // Подстраховка на случай закрытия окна без паузы — периодический чекпоинт
  // позиции, не привязанный к статусу play/pause.
  setInterval(savePlayback, 5000);
}

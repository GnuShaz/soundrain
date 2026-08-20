import { getLastManualSeekAt, usePlayerStore } from "../stores/player";
import { useQueueStore } from "../stores/queue";
import { onAudioEnded, onAudioTick } from "./events";

let wired = false;

/** Защитное окно после ручного сика — см. комментарий у lastManualSeekAt в player.ts. */
const SEEK_GRACE_MS = 500;

/**
 * `audio:tick` пишет прямо в Zustand-стор через `setState`, минуя React —
 * иначе 10 обновлений в секунду ререндерили бы всё дерево, а не только
 * компоненты, реально подписанные на позицию.
 */
export function wirePlayerEvents() {
  if (wired) return;
  wired = true;
  onAudioTick((positionSecs) => {
    if (Date.now() - getLastManualSeekAt() < SEEK_GRACE_MS) return;
    usePlayerStore.setState({ positionSecs });
  });
  onAudioEnded(() => useQueueStore.getState().next());
}

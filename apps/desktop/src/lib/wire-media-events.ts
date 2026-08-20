import { invoke } from "@tauri-apps/api/core";
import { type PlayerStatus, usePlayerStore } from "../stores/player";
import { useQueueStore } from "../stores/queue";
import { onMediaEvent } from "./events";
import { pushDiscordPresence } from "./wire-discord";

const SEEK_STEP_SECS = 5;

let wired = false;

/**
 * Rust не решает сам, что дальше играть — только транслирует нажатие
 * системной медиа-клавиши. Next/prev идут через очередь, play/pause/toggle —
 * через тот же player.toggle(), что и клик по плеер-бару.
 */
export function wireMediaEvents() {
  if (wired) return;
  wired = true;

  onMediaEvent("media:play", () => {
    const player = usePlayerStore.getState();
    if (player.status === "paused") player.toggle();
  });
  onMediaEvent("media:pause", () => {
    const player = usePlayerStore.getState();
    if (player.status === "playing") player.toggle();
  });
  onMediaEvent("media:toggle", () => usePlayerStore.getState().toggle());
  onMediaEvent("media:next", () => useQueueStore.getState().next());
  onMediaEvent("media:prev", () => useQueueStore.getState().prev());
  onMediaEvent("media:seek-forward", () => {
    const player = usePlayerStore.getState();
    player.seek(Math.min(player.durationSecs, player.positionSecs + SEEK_STEP_SECS));
  });
  onMediaEvent("media:seek-backward", () => {
    const player = usePlayerStore.getState();
    player.seek(Math.max(0, player.positionSecs - SEEK_STEP_SECS));
  });

  // Обратное направление: центр уведомлений ОС должен видеть текущий трек и
  // статус — обновляем только на смену трека/статуса, не на каждый тик
  // позиции (иначе 10 IPC-вызовов в секунду).
  let lastTrackId: number | null = null;
  let lastStatus: PlayerStatus | null = null;
  usePlayerStore.subscribe((state) => {
    const trackChanged = state.currentTrack?.id !== lastTrackId;
    const statusChanged = state.status !== lastStatus;
    lastTrackId = state.currentTrack?.id ?? null;
    lastStatus = state.status;
    if (!trackChanged && !statusChanged) return;

    // Тот же guard, что и выше (не на каждый тик) — Discord Presence не
    // знает о режимах отображения, только пересылает то, что тут собрано.
    pushDiscordPresence();

    if (!state.currentTrack) {
      invoke("media_clear").catch(() => {});
      return;
    }
    if (state.status === "loading" || state.status === "error") return;

    invoke("media_update", {
      payload: {
        title: state.currentTrack.title,
        artist: state.currentTrack.artist,
        coverUrl: state.currentTrack.artworkUrl,
        durationSecs: state.durationSecs,
        positionSecs: state.positionSecs,
        playing: state.status === "playing",
      },
    }).catch(() => {});
  });
}

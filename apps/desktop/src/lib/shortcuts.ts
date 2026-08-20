import { usePlayerStore } from "../stores/player";

const SEEK_STEP_SECS = 5;
const VOLUME_STEP = 0.05;

let wired = false;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

/**
 * Space — play/pause, ←/→ — перемотка на SEEK_STEP_SECS назад/вперёд,
 * ↑/↓ — громкость. Не должны конфликтовать с полем ввода в поиске/логине —
 * пропускаем, если фокус внутри текстового поля.
 */
export function wireGlobalShortcuts() {
  if (wired) return;
  wired = true;

  window.addEventListener("keydown", (event) => {
    if (isTypingTarget(event.target)) return;

    const player = usePlayerStore.getState();

    switch (event.code) {
      case "Space":
        if (!player.currentTrack) return;
        event.preventDefault();
        player.toggle();
        break;
      case "ArrowLeft":
        if (!player.currentTrack) return;
        event.preventDefault();
        player.seek(Math.max(0, player.positionSecs - SEEK_STEP_SECS));
        break;
      case "ArrowRight":
        if (!player.currentTrack) return;
        event.preventDefault();
        player.seek(Math.min(player.durationSecs, player.positionSecs + SEEK_STEP_SECS));
        break;
      case "ArrowUp":
        event.preventDefault();
        player.setVolume(Math.min(1, player.volume + VOLUME_STEP));
        break;
      case "ArrowDown":
        event.preventDefault();
        player.setVolume(Math.max(0, player.volume - VOLUME_STEP));
        break;
      default:
        break;
    }
  });
}

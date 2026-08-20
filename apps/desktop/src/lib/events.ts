import { listen } from "@tauri-apps/api/event";
import type { AuthStatus } from "./api";

export function onAuthChanged(callback: (status: AuthStatus) => void) {
  return listen<AuthStatus>("auth:changed", (event) => callback(event.payload));
}

export function onAudioTick(callback: (positionSecs: number) => void) {
  return listen<{ positionSecs: number }>("audio:tick", (event) =>
    callback(event.payload.positionSecs),
  );
}

export function onAudioEnded(callback: () => void) {
  return listen("audio:ended", () => callback());
}

const MEDIA_EVENT_NAMES = [
  "media:play",
  "media:pause",
  "media:toggle",
  "media:next",
  "media:prev",
  "media:seek-forward",
  "media:seek-backward",
] as const;

export type MediaEventName = (typeof MEDIA_EVENT_NAMES)[number];

export function onMediaEvent(name: MediaEventName, callback: () => void) {
  return listen(name, () => callback());
}

export { MEDIA_EVENT_NAMES };

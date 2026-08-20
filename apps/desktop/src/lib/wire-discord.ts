import { usePlayerStore } from "../stores/player";
import { useSettingsStore } from "../stores/settings";
import { api } from "./api";

/**
 * Rust ничего не знает о режимах отображения — вся логика "что показывать"
 * (Трек / Только автора / Только активность, кнопка SoundCloud, пауза,
 * таймкоды) здесь, во фронте, тот же принцип, что и у `media_update`/трея.
 * `pushDiscordPresence` вызывается из уже существующего guard'а в
 * `wire-media-events.ts` (на смену трека/статуса) и из `seek()` в
 * `stores/player.ts` (иначе после ручной перемотки прогресс-бар в Discord
 * остался бы тикать от старой точки) — здесь дополнительно подписка на смену
 * самих настроек Discord, которая может произойти без смены трека.
 *
 * Таймкоды — не наше дело считать на каждый тик: Discord сам рисует живой
 * прогресс-бар по паре `start`/`end` (unix-мс), полученной один раз. На
 * паузе оба поля — `null`, иначе полоска продолжала бы тикать, пока трек
 * стоит на месте; вместо неё — текстовая пометка "· Пауза" в том поле,
 * которое реально показывается (state, иначе details, иначе отдельной
 * строкой, если в выбранном режиме больше нечего показывать).
 */
export function pushDiscordPresence() {
  const { discordEnabled, discordMode, discordButtonEnabled } = useSettingsStore.getState();
  if (!discordEnabled) {
    api.discordClearPresence().catch(() => {});
    return;
  }

  const { currentTrack, status, positionSecs, durationSecs } = usePlayerStore.getState();
  if (!currentTrack || status === "loading" || status === "error") {
    api.discordClearPresence().catch(() => {});
    return;
  }

  const playing = status === "playing";

  let details: string | null = null;
  let state: string | null = null;
  if (discordMode === "track") {
    details = currentTrack.title;
    state = currentTrack.artist;
  } else if (discordMode === "artist") {
    details = currentTrack.artist;
  }

  if (!playing) {
    if (state) state = `${state} · Пауза`;
    else if (details) details = `${details} · Пауза`;
    else state = "Пауза";
  }

  let startTimestampMs: number | null = null;
  let endTimestampMs: number | null = null;
  if (playing) {
    startTimestampMs = Date.now() - positionSecs * 1000;
    if (durationSecs > 0) endTimestampMs = startTimestampMs + durationSecs * 1000;
  }

  api
    .discordUpdatePresence({
      details,
      state,
      largeImageUrl: currentTrack.artworkUrl,
      buttonLabel: discordButtonEnabled ? "Открыть на SoundCloud" : null,
      buttonUrl: discordButtonEnabled ? currentTrack.permalinkUrl : null,
      startTimestampMs,
      endTimestampMs,
    })
    .catch(() => {});
}

let wired = false;

export function wireDiscordPresence() {
  if (wired) return;
  wired = true;
  useSettingsStore.subscribe(pushDiscordPresence);
}

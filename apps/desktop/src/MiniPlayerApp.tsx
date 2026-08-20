import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { useEffect, useState } from "react";

interface NowPlaying {
  title: string;
  artist: string;
  coverUrl: string | null;
  durationSecs: number;
  positionSecs: number;
  playing: boolean;
}

/**
 * Отдельный процесс/вебвью — своего Zustand-стора здесь нет и не будет
 * (окна Tauri не шарят JS-состояние). Источник правды — broadcast-событие
 * `media:now-playing` из Rust (см. `media::media_update`/`media_clear`),
 * снимок на монтирование берём отдельной командой `media_get_snapshot`,
 * т.к. окно может открыться уже после того, как трек начал играть.
 * Кнопки не трогают очередь напрямую — эмитят те же `media:*` события,
 * что и системные медиа-клавиши, их слушает `wireMediaEvents` в главном
 * окне (события Tauri по умолчанию глобальные, а не привязаны к окну).
 */
export function MiniPlayerApp() {
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);

  useEffect(() => {
    invoke<NowPlaying | null>("media_get_snapshot")
      .then(setNowPlaying)
      .catch(() => {});
    const unlisten = listen<NowPlaying | null>("media:now-playing", (event) =>
      setNowPlaying(event.payload),
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div
      data-tauri-drag-region
      className="flex h-full w-full items-center gap-3 border border-hairline bg-surface px-3"
    >
      <div data-tauri-drag-region className="h-14 w-14 shrink-0 bg-bg">
        {nowPlaying?.coverUrl && (
          <img
            src={nowPlaying.coverUrl}
            alt=""
            draggable={false}
            className="h-full w-full object-cover"
          />
        )}
      </div>

      <div data-tauri-drag-region className="min-w-0 flex-1">
        <p className="truncate text-sm text-text">{nowPlaying?.title ?? "Ничего не играет"}</p>
        <p className="truncate text-xs text-muted">{nowPlaying?.artist ?? ""}</p>
        <div className="mt-1.5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => emit("media:prev")}
            aria-label="Предыдущий трек"
            className="text-muted hover:text-text"
          >
            <SkipBack size={14} />
          </button>
          <button
            type="button"
            onClick={() => emit("media:toggle")}
            aria-label={nowPlaying?.playing ? "Пауза" : "Играть"}
            className="text-accent"
          >
            {nowPlaying?.playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            type="button"
            onClick={() => emit("media:next")}
            aria-label="Следующий трек"
            className="text-muted hover:text-text"
          >
            <SkipForward size={14} />
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => getCurrentWindow().close()}
        aria-label="Закрыть мини-плеер"
        className="self-start text-muted hover:text-text"
      >
        <X size={12} />
      </button>
    </div>
  );
}

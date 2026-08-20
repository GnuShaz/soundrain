import { Heart, Pause } from "lucide-react";
import type { Track } from "../lib/api";
import { formatDuration } from "../lib/formatters";
import { toggleLike } from "../lib/likes-sync";
import { useLikesStore } from "../stores/likes";
import { useNavigationStore } from "../stores/navigation";
import { usePlayerStore } from "../stores/player";
import { useQueueStore } from "../stores/queue";

interface TrackRowProps {
  track: Track;
  /** Список, из которого кликнут трек — «играть отсюда» ставит его целиком в очередь. */
  tracks: Track[];
  index: number;
}

export function TrackRow({ track, tracks, index }: TrackRowProps) {
  const isCurrent = usePlayerStore((s) => s.currentTrack?.id === track.id);
  const status = usePlayerStore((s) => (isCurrent ? s.status : null));
  const liked = useLikesStore((s) => s.likedIds.has(track.id));
  const likePending = useLikesStore((s) => s.pendingIds.has(track.id));

  function handleClick() {
    const playerState = usePlayerStore.getState();
    if (isCurrent && (playerState.status === "playing" || playerState.status === "paused")) {
      playerState.toggle();
    } else {
      useQueueStore.getState().playFrom(tracks, index);
    }
  }

  return (
    <div className="flex w-full items-center gap-3 border-b border-hairline px-1 py-2 hover:bg-surface">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          type="button"
          onClick={handleClick}
          aria-label={track.title}
          className="h-10 w-10 shrink-0 bg-surface"
        >
          {track.artworkUrl && (
            <img src={track.artworkUrl} alt="" className="h-full w-full object-cover" />
          )}
        </button>
        <div className="min-w-0 flex-1 text-left">
          <button
            type="button"
            onClick={handleClick}
            className={`block w-full truncate text-left text-sm ${isCurrent ? "text-accent" : "text-text"}`}
          >
            {track.title}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              useNavigationStore.getState().openArtist(track.artistId);
            }}
            className="block max-w-full truncate text-left text-xs text-muted hover:text-accent hover:underline"
          >
            {track.artist}
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => toggleLike(track)}
        disabled={likePending}
        aria-label={liked ? "Убрать лайк" : "Лайкнуть"}
        aria-pressed={liked}
        className={`shrink-0 disabled:opacity-40 ${liked ? "text-accent" : "text-muted hover:text-text"}`}
      >
        <Heart size={14} fill={liked ? "currentColor" : "none"} />
      </button>

      {isCurrent && status === "playing" ? (
        <Pause size={14} className="shrink-0 text-accent" />
      ) : isCurrent && status === "loading" ? (
        <span className="shrink-0 text-xs text-muted">…</span>
      ) : (
        <span className="shrink-0 font-mono text-xs text-muted">
          {formatDuration(track.durationMs)}
        </span>
      )}
    </div>
  );
}

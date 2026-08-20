import { Heart, Pause, Play } from "lucide-react";
import type { Track } from "../lib/api";
import { toggleLike } from "../lib/likes-sync";
import { useLikesStore } from "../stores/likes";
import { useNavigationStore } from "../stores/navigation";
import { usePlayerStore } from "../stores/player";
import { useQueueStore } from "../stores/queue";

interface TrackCardProps {
  track: Track;
  /** Список, из которого кликнут трек — «играть отсюда» ставит его целиком в очередь. */
  tracks: Track[];
  index: number;
}

export function TrackCard({ track, tracks, index }: TrackCardProps) {
  const isCurrent = usePlayerStore((s) => s.currentTrack?.id === track.id);
  const status = usePlayerStore((s) => (isCurrent ? s.status : null));
  const liked = useLikesStore((s) => s.likedIds.has(track.id));
  const likePending = useLikesStore((s) => s.pendingIds.has(track.id));
  const isPlaying = status === "playing";

  function handleClick() {
    const playerState = usePlayerStore.getState();
    if (isCurrent && (playerState.status === "playing" || playerState.status === "paused")) {
      playerState.toggle();
    } else {
      useQueueStore.getState().playFrom(tracks, index);
    }
  }

  return (
    <div className="group flex w-40 shrink-0 flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        aria-label={isPlaying ? "Пауза" : "Играть"}
        className="relative block h-40 w-40 shrink-0 bg-surface"
      >
        {track.artworkUrl && (
          <img src={track.artworkUrl} alt="" className="h-full w-full object-cover" />
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-bg/0 opacity-0 transition-opacity group-hover:bg-bg/50 group-hover:opacity-100">
          {isPlaying ? (
            <Pause size={28} className="text-accent" fill="currentColor" />
          ) : (
            <Play size={28} className="text-accent" fill="currentColor" />
          )}
        </span>
      </button>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`line-clamp-2 text-sm ${isCurrent ? "text-accent" : "text-text"}`}>
            {track.title}
          </p>
          <button
            type="button"
            onClick={() => useNavigationStore.getState().openArtist(track.artistId)}
            className="block max-w-full truncate text-left text-xs text-muted hover:text-accent hover:underline"
          >
            {track.artist}
          </button>
        </div>
        <button
          type="button"
          onClick={() => toggleLike(track)}
          disabled={likePending}
          aria-label={liked ? "Убрать лайк" : "Лайкнуть"}
          aria-pressed={liked}
          className={`mt-0.5 shrink-0 disabled:opacity-40 ${liked ? "text-accent" : "text-muted hover:text-text"}`}
        >
          <Heart size={14} fill={liked ? "currentColor" : "none"} />
        </button>
      </div>
    </div>
  );
}

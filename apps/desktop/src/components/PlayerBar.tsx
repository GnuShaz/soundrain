import * as Slider from "@radix-ui/react-slider";
import { AudioLines, Heart, ListMusic, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useState } from "react";
import { formatSeconds } from "../lib/formatters";
import { toggleLike } from "../lib/likes-sync";
import { useLikesStore } from "../stores/likes";
import { useNavigationStore } from "../stores/navigation";
import { usePlayerStore } from "../stores/player";
import { useQueueStore } from "../stores/queue";
import { Equalizer } from "./Equalizer";

interface PlayerBarProps {
  queueOpen: boolean;
  onToggleQueue: () => void;
}

export function PlayerBar({ queueOpen, onToggleQueue }: PlayerBarProps) {
  const {
    currentTrack,
    status,
    positionSecs,
    durationSecs,
    volume,
    errorMessage,
    toggle,
    seek,
    setVolume,
  } = usePlayerStore();
  const currentIndex = useQueueStore((s) => s.currentIndex);
  const queueLength = useQueueStore((s) => s.items.length);
  const hasPrev = currentIndex !== null && currentIndex > 0;
  const hasNext = currentIndex !== null && currentIndex < queueLength - 1;
  const liked = useLikesStore((s) => (currentTrack ? s.likedIds.has(currentTrack.id) : false));
  const likePending = useLikesStore((s) =>
    currentTrack ? s.pendingIds.has(currentTrack.id) : false,
  );

  // Во время перетаскивания ползунок живёт своим локальным состоянием, не
  // трогая audio_seek на каждый микро-шаг — иначе гонка с audio:tick
  // (тикает раз в 100мс поверх позиции rodio) визуально "отбрасывала"
  // перемотку назад вперёд: поздний тик перезаписывал ещё не применённый
  // сик более старой (большей) позицией. Реальный сик — только на отпускание.
  const [dragPositionSecs, setDragPositionSecs] = useState<number | null>(null);
  const displayedPositionSecs = dragPositionSecs ?? positionSecs;
  const [eqOpen, setEqOpen] = useState(false);

  const eqButton = (
    <button
      type="button"
      onClick={() => setEqOpen(true)}
      aria-label="Эквалайзер"
      className="shrink-0 text-muted hover:text-text"
    >
      <AudioLines size={18} />
    </button>
  );

  const queueButton = (
    <button
      type="button"
      onClick={onToggleQueue}
      aria-label="Очередь"
      className={`shrink-0 ${queueOpen ? "text-accent" : "text-muted hover:text-text"}`}
    >
      <ListMusic size={18} />
    </button>
  );

  if (!currentTrack) {
    return (
      <div className="flex h-[72px] shrink-0 items-center justify-between border-t border-hairline bg-surface px-6">
        <span className="flex-1 text-center text-sm text-muted">Ничего не играет</span>
        <div className="flex shrink-0 items-center gap-4">
          {eqButton}
          {queueButton}
        </div>
        <Equalizer open={eqOpen} onOpenChange={setEqOpen} />
      </div>
    );
  }

  const isLoading = status === "loading";
  const isError = status === "error";
  const isPlaying = status === "playing";

  return (
    <div className="flex h-[72px] shrink-0 items-center gap-4 border-t border-hairline bg-surface px-6">
      <div className="flex w-56 shrink-0 items-center gap-3">
        <div className="h-12 w-12 shrink-0 bg-bg">
          {currentTrack.artworkUrl && (
            <img src={currentTrack.artworkUrl} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-text">{currentTrack.title}</p>
          <button
            type="button"
            onClick={() => useNavigationStore.getState().openArtist(currentTrack.artistId)}
            className="block max-w-full truncate text-left text-xs text-muted hover:text-accent hover:underline"
          >
            {currentTrack.artist}
          </button>
        </div>
        <button
          type="button"
          onClick={() => toggleLike(currentTrack)}
          disabled={likePending}
          aria-label={liked ? "Убрать лайк" : "Лайкнуть"}
          aria-pressed={liked}
          className={`shrink-0 disabled:opacity-40 ${liked ? "text-accent" : "text-muted hover:text-text"}`}
        >
          <Heart size={14} fill={liked ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <button
          type="button"
          onClick={() => useQueueStore.getState().prev()}
          disabled={!hasPrev}
          aria-label="Предыдущий трек"
          className="text-muted hover:text-text disabled:opacity-30"
        >
          <SkipBack size={16} />
        </button>
        <button
          type="button"
          onClick={toggle}
          disabled={isLoading || isError}
          aria-label={isPlaying ? "Пауза" : "Играть"}
          className="text-accent disabled:opacity-30"
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <button
          type="button"
          onClick={() => useQueueStore.getState().next()}
          disabled={!hasNext}
          aria-label="Следующий трек"
          className="text-muted hover:text-text disabled:opacity-30"
        >
          <SkipForward size={16} />
        </button>
      </div>

      <div className="flex flex-1 items-center gap-2">
        <span className="w-9 shrink-0 text-right font-mono text-xs text-muted">
          {formatSeconds(displayedPositionSecs)}
        </span>
        <Slider.Root
          className="relative flex h-4 flex-1 touch-none select-none items-center"
          min={0}
          max={Math.max(durationSecs, 0.01)}
          step={1}
          value={[Math.min(displayedPositionSecs, durationSecs)]}
          disabled={isLoading || isError}
          onValueChange={([value]) => setDragPositionSecs(value)}
          onValueCommit={([value]) => {
            seek(value);
            setDragPositionSecs(null);
          }}
        >
          <Slider.Track className="relative h-px flex-1 bg-hairline">
            <Slider.Range className="absolute h-full bg-accent" />
          </Slider.Track>
          <Slider.Thumb className="block h-2.5 w-2.5 bg-accent outline-none" />
        </Slider.Root>
        {isError ? (
          <span className="max-w-60 shrink-0 truncate text-xs text-danger">{errorMessage}</span>
        ) : isLoading ? (
          <span className="w-24 shrink-0 text-xs text-muted">Буферизация…</span>
        ) : (
          <span className="w-9 shrink-0 font-mono text-xs text-muted">
            {formatSeconds(durationSecs)}
          </span>
        )}
      </div>

      <Slider.Root
        className="relative flex h-4 w-24 shrink-0 touch-none select-none items-center"
        min={0}
        max={1}
        step={0.01}
        value={[volume]}
        onValueChange={([value]) => setVolume(value)}
      >
        <Slider.Track className="relative h-px flex-1 bg-hairline">
          <Slider.Range className="absolute h-full bg-muted" />
        </Slider.Track>
        <Slider.Thumb className="block h-2.5 w-2.5 bg-muted outline-none" />
      </Slider.Root>

      {eqButton}
      {queueButton}
      <Equalizer open={eqOpen} onOpenChange={setEqOpen} />
    </div>
  );
}

import { X } from "lucide-react";
import { formatDuration } from "../lib/formatters";
import { useNavigationStore } from "../stores/navigation";
import { useQueueStore } from "../stores/queue";

export function QueuePanel({ onClose }: { onClose: () => void }) {
  const items = useQueueStore((s) => s.items);
  const currentIndex = useQueueStore((s) => s.currentIndex);

  return (
    <div className="flex w-80 shrink-0 flex-col border-l border-hairline bg-surface">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <span className="text-sm text-text">Очередь</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть очередь"
          className="text-muted hover:text-text"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted">Очередь пуста</p>
        ) : (
          items.map((track, index) => {
            const isCurrent = index === currentIndex;
            return (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: один и тот же трек может встретиться в очереди дважды — одного track.id недостаточно для уникальности ключа
                key={`${track.id}-${index}`}
                className={`flex w-full items-center gap-3 border-b border-hairline px-4 py-2 hover:bg-bg ${
                  isCurrent ? "bg-bg" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => useQueueStore.getState().playFrom(items, index)}
                  aria-label={track.title}
                  className="h-9 w-9 shrink-0 bg-bg"
                >
                  {track.artworkUrl && (
                    <img src={track.artworkUrl} alt="" className="h-full w-full object-cover" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => useQueueStore.getState().playFrom(items, index)}
                    className={`block w-full truncate text-left text-sm ${isCurrent ? "text-accent" : "text-text"}`}
                  >
                    {track.title}
                  </button>
                  <button
                    type="button"
                    onClick={() => useNavigationStore.getState().openArtist(track.artistId)}
                    className="block max-w-full truncate text-left text-xs text-muted hover:text-accent hover:underline"
                  >
                    {track.artist}
                  </button>
                </div>
                <span className="shrink-0 font-mono text-xs text-muted">
                  {formatDuration(track.durationMs)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

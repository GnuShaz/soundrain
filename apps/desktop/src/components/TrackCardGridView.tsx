import { isScError, type Track } from "../lib/api";
import { TrackCard } from "./TrackCard";

function SkeletonCard() {
  return (
    <div className="flex w-40 flex-col gap-2">
      <div className="h-40 w-40 bg-surface" />
      <div className="space-y-2">
        <div className="h-3 w-2/3 bg-surface" />
        <div className="h-2.5 w-1/3 bg-surface" />
      </div>
    </div>
  );
}

interface TrackCardGridViewProps {
  tracks: Track[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  emptyTitle: string;
  emptyHint: string;
}

export function TrackCardGridView({
  tracks,
  isLoading,
  isError,
  error,
  onRetry,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  emptyTitle,
  emptyHint,
}: TrackCardGridViewProps) {
  if (isLoading) {
    return (
      <div className="flex flex-wrap gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: статичный список скелетонов без данных для ключа
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    const message =
      isScError(error) && error.kind === "network" ? error.message : "неизвестная ошибка";
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm text-danger">Не удалось загрузить: {message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="border border-hairline px-4 py-2 text-sm text-text hover:border-accent"
        >
          Повторить
        </button>
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 py-16 text-center">
        <p className="text-sm text-text">{emptyTitle}</p>
        <p className="text-sm text-muted">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-4">
        {tracks.map((track, index) => (
          <TrackCard key={track.id} track={track} tracks={tracks} index={index} />
        ))}
      </div>
      {hasNextPage && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={isFetchingNextPage}
          className="self-center border border-hairline px-4 py-2 text-sm text-muted hover:border-accent hover:text-text disabled:opacity-40"
        >
          {isFetchingNextPage ? "Загружаем…" : "Показать ещё"}
        </button>
      )}
    </div>
  );
}

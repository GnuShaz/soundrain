import { isScError, type PlaylistSummary } from "../lib/api";
import { useHomeFeed } from "../lib/use-home-feed";
import { Shelf } from "./Shelf";

function SkeletonShelf() {
  return (
    <div className="flex flex-col gap-3">
      <div className="h-4 w-40 bg-surface" />
      <div className="flex gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: статичный скелетон без данных для ключа
          <div key={i} className="h-40 w-40 shrink-0 bg-surface" />
        ))}
      </div>
    </div>
  );
}

interface HomeFeedProps {
  onOpenPlaylist: (playlist: PlaylistSummary) => void;
}

export function HomeFeed({ onOpenPlaylist }: HomeFeedProps) {
  const { data, isLoading, isError, error, refetch } = useHomeFeed();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-8">
        {Array.from({ length: 3 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: статичный скелетон без данных для ключа
          <SkeletonShelf key={i} />
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
          onClick={() => refetch()}
          className="border border-hairline px-4 py-2 text-sm text-text hover:border-accent"
        >
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {data?.map((section) => (
        <Shelf
          key={section.title}
          title={section.title}
          items={section.items}
          onOpenPlaylist={onOpenPlaylist}
        />
      ))}
    </div>
  );
}

import { useEffect, useState } from "react";
import { PlaylistCardGridView } from "../components/PlaylistCardGridView";
import { PlaylistView } from "../components/PlaylistView";
import { TrackCardGridView } from "../components/TrackCardGridView";
import type { PlaylistSummary } from "../lib/api";
import { useSearchPlaylists } from "../lib/use-search-playlists";
import { useSearchTracks } from "../lib/use-search-tracks";
import { type SearchMode, useSearchStore } from "../stores/search";

const DEBOUNCE_MS = 400;

const MODES: { value: SearchMode; label: string }[] = [
  { value: "tracks", label: "Треки" },
  { value: "playlists", label: "Плейлисты" },
];

export function Search() {
  const query = useSearchStore((s) => s.query);
  const setQuery = useSearchStore((s) => s.setQuery);
  const debounced = useSearchStore((s) => s.debounced);
  const setDebounced = useSearchStore((s) => s.setDebounced);
  const mode = useSearchStore((s) => s.mode);
  const setMode = useSearchStore((s) => s.setMode);
  // Открытая карточка плейлиста — намеренно не в сторе (тот же прецедент,
  // что и с PlaylistView в ленте): уход со вкладки её сбрасывает, это
  // навигация, а не введённый пользователем текст.
  const [openPlaylist, setOpenPlaylist] = useState<PlaylistSummary | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, setDebounced]);

  const trimmed = debounced.trim();
  const tracksQuery = useSearchTracks(mode === "tracks" ? debounced : "");
  const playlistsQuery = useSearchPlaylists(mode === "playlists" ? debounced : "");

  if (openPlaylist) {
    return <PlaylistView playlist={openPlaylist} onBack={() => setOpenPlaylist(null)} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Искать треки…"
        // biome-ignore lint/a11y/noAutofocus: единственное поле на экране поиска, автофокус ускоряет ввод запроса
        autoFocus
        className="w-full border border-hairline bg-surface px-3 py-2.5 text-sm text-text placeholder:text-muted/60 outline-none focus:border-accent"
      />

      <div className="flex gap-1">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMode(m.value)}
            className={`border px-3 py-1.5 text-sm ${
              mode === m.value
                ? "border-accent text-accent"
                : "border-hairline text-muted hover:text-text"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {trimmed.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">
          Начните вводить, чтобы найти {mode === "tracks" ? "треки" : "плейлисты"}
        </p>
      ) : mode === "tracks" ? (
        <TrackCardGridView
          tracks={tracksQuery.data?.pages.flatMap((page) => page.tracks) ?? []}
          isLoading={tracksQuery.isLoading}
          isError={tracksQuery.isError}
          error={tracksQuery.error}
          onRetry={() => tracksQuery.refetch()}
          hasNextPage={tracksQuery.hasNextPage}
          isFetchingNextPage={tracksQuery.isFetchingNextPage}
          onLoadMore={() => tracksQuery.fetchNextPage()}
          emptyTitle="Ничего не нашлось"
          emptyHint={`По запросу «${trimmed}» треков нет`}
        />
      ) : (
        <PlaylistCardGridView
          playlists={playlistsQuery.data?.pages.flatMap((page) => page.playlists) ?? []}
          isLoading={playlistsQuery.isLoading}
          isError={playlistsQuery.isError}
          error={playlistsQuery.error}
          onRetry={() => playlistsQuery.refetch()}
          hasNextPage={playlistsQuery.hasNextPage}
          isFetchingNextPage={playlistsQuery.isFetchingNextPage}
          onLoadMore={() => playlistsQuery.fetchNextPage()}
          onOpen={setOpenPlaylist}
          emptyTitle="Ничего не нашлось"
          emptyHint={`По запросу «${trimmed}» плейлистов нет`}
        />
      )}
    </div>
  );
}

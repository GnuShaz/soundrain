import * as Tabs from "@radix-ui/react-tabs";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { PlaylistCardGridView } from "../components/PlaylistCardGridView";
import { PlaylistView } from "../components/PlaylistView";
import { TrackCardGridView } from "../components/TrackCardGridView";
import { api, type PlaylistSummary } from "../lib/api";
import { formatCount } from "../lib/formatters";
import { useUserPlaylists } from "../lib/use-user-playlists";
import { useUserTracks } from "../lib/use-user-tracks";

const TAB_TRIGGER_CLASS =
  "border-b-2 border-transparent py-3 text-sm text-muted transition-colors hover:text-text data-[state=active]:border-accent data-[state=active]:text-text";

interface ArtistPageProps {
  artistId: number;
  onBack: () => void;
}

/**
 * Референс `artist.png` (пользователь прислал в корень репо) — переверстан
 * под наш стиль (hairline-карточки вместо стекла/градиентов). Без
 * «Подписаться» и вкладок подписчиков/подписок — это писательные эндпоинты
 * и разделы, которых не было в исходном скоупе плана (пункт 14); «Лайки»
 * тоже не эндпоинт, доступный по чужому user_id в проверенном виде.
 */
export function ArtistPage({ artistId, onBack }: ArtistPageProps) {
  const {
    data: profile,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["artist-profile", artistId],
    queryFn: () => api.scUserProfile(artistId),
  });
  const [openPlaylist, setOpenPlaylist] = useState<PlaylistSummary | null>(null);

  const tracksQuery = useUserTracks(artistId);
  const playlistsQuery = useUserPlaylists(artistId);

  if (openPlaylist) {
    return <PlaylistView playlist={openPlaylist} onBack={() => setOpenPlaylist(null)} />;
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-bg text-text">
      <div className="shrink-0 px-6 py-4">
        <button
          type="button"
          onClick={onBack}
          className="flex w-fit items-center gap-1 text-sm text-muted hover:text-text"
        >
          <ArrowLeft size={14} />
          Назад
        </button>

        {isLoading ? (
          <div className="mt-4 h-32 animate-pulse bg-surface" />
        ) : isError || !profile ? (
          <p className="mt-4 text-sm text-danger">Не удалось загрузить профиль</p>
        ) : (
          <div className="mt-4 flex items-start gap-6 border border-hairline bg-surface p-6">
            <div className="h-32 w-32 shrink-0 bg-bg">
              {profile.avatarUrl && (
                <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl text-text">{profile.username}</h1>
              {profile.description && (
                <p className="mt-2 line-clamp-3 text-sm text-muted">{profile.description}</p>
              )}
              <div className="mt-4 flex gap-2">
                <StatChip value={formatCount(profile.followersCount)} label="подписчики" />
                <StatChip value={formatCount(profile.trackCount)} label="треки" />
                <StatChip value={formatCount(profile.playlistCount)} label="плейлисты" />
              </div>
            </div>
          </div>
        )}
      </div>

      <Tabs.Root defaultValue="tracks" className="flex flex-1 flex-col overflow-hidden">
        <Tabs.List className="flex gap-6 border-b border-hairline px-6">
          <Tabs.Trigger value="tracks" className={TAB_TRIGGER_CLASS}>
            Треки
          </Tabs.Trigger>
          <Tabs.Trigger value="playlists" className={TAB_TRIGGER_CLASS}>
            Плейлисты
          </Tabs.Trigger>
        </Tabs.List>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <Tabs.Content value="tracks">
            <TrackCardGridView
              tracks={tracksQuery.data?.pages.flatMap((page) => page.tracks) ?? []}
              isLoading={tracksQuery.isLoading}
              isError={tracksQuery.isError}
              error={tracksQuery.error}
              onRetry={() => tracksQuery.refetch()}
              hasNextPage={tracksQuery.hasNextPage}
              isFetchingNextPage={tracksQuery.isFetchingNextPage}
              onLoadMore={() => tracksQuery.fetchNextPage()}
              emptyTitle="Треков нет"
              emptyHint="У исполнителя пока нет опубликованных треков"
            />
          </Tabs.Content>
          <Tabs.Content value="playlists">
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
              emptyTitle="Плейлистов нет"
              emptyHint="У исполнителя пока нет опубликованных плейлистов"
            />
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  );
}

function StatChip({ value, label }: { value: string; label: string }) {
  return (
    <div className="border border-hairline px-3 py-1.5 text-center">
      <p className="font-mono text-sm text-text">{value}</p>
      <p className="text-[10px] text-muted uppercase tracking-wide">{label}</p>
    </div>
  );
}

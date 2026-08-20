import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Play } from "lucide-react";
import { api, type PlaylistSummary } from "../lib/api";
import { useQueueStore } from "../stores/queue";
import { TrackListView } from "./TrackListView";

interface PlaylistViewProps {
  playlist: PlaylistSummary;
  onBack: () => void;
}

export function PlaylistView({ playlist, onBack }: PlaylistViewProps) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["playlist-tracks", playlist.id],
    queryFn: async () => {
      const ids = playlist.trackIds ?? (await api.scPlaylistTrackIds(Number(playlist.id)));
      if (ids.length === 0) return [];
      return api.scResolveTracks(ids);
    },
  });

  const tracks = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={onBack}
        className="flex w-fit items-center gap-1 text-sm text-muted hover:text-text"
      >
        <ArrowLeft size={14} />
        Назад
      </button>

      <div className="flex items-end gap-4">
        <div className="h-40 w-40 shrink-0 bg-surface">
          {playlist.artworkUrl && (
            <img src={playlist.artworkUrl} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <div>
            <p className="text-xl text-text">{playlist.title}</p>
            <p className="font-mono text-sm text-muted">{playlist.trackCount} треков</p>
          </div>
          <button
            type="button"
            onClick={() => useQueueStore.getState().playFrom(tracks, 0)}
            disabled={tracks.length === 0}
            className="flex w-fit items-center gap-2 bg-accent px-4 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Play size={14} fill="currentColor" />
            Играть всё
          </button>
        </div>
      </div>

      <TrackListView
        tracks={tracks}
        isLoading={isLoading}
        isError={isError}
        error={error}
        onRetry={() => refetch()}
        emptyTitle="Пусто"
        emptyHint="В этом плейлисте нет доступных треков"
      />
    </div>
  );
}

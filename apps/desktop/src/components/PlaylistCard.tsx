import { ListMusic } from "lucide-react";
import type { PlaylistSummary } from "../lib/api";

interface PlaylistCardProps {
  playlist: PlaylistSummary;
  onOpen: (playlist: PlaylistSummary) => void;
}

export function PlaylistCard({ playlist, onOpen }: PlaylistCardProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(playlist)}
      className="flex w-40 shrink-0 flex-col gap-2 text-left"
    >
      <div className="flex h-40 w-40 shrink-0 items-center justify-center bg-surface">
        {playlist.artworkUrl ? (
          <img src={playlist.artworkUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          // У некоторых разделов mixed-selections (например "More of what
          // you like") SoundCloud не отдаёт artwork_url вообще — не баг
          // загрузки, просто нет картинки у этого мини-плейлиста.
          <ListMusic size={28} className="text-muted" />
        )}
      </div>
      <div className="min-w-0">
        <p className="line-clamp-2 text-sm text-text">{playlist.title}</p>
        <p className="font-mono text-xs text-muted">{playlist.trackCount} треков</p>
      </div>
    </button>
  );
}

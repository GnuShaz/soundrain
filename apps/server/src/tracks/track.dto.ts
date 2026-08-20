// Форма трека, которую присылает десктоп-клиент — совпадает с его
// собственным `Track` (apps/desktop/src/lib/api.ts), чтобы не городить
// отдельный маппинг на границе.
export interface TrackDto {
  id: number;
  title: string;
  artist: string;
  artworkUrl: string | null;
  durationMs: number;
  permalinkUrl: string;
  streamable: boolean;
}

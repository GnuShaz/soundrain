import { invoke } from "@tauri-apps/api/core";

export interface ScUser {
  id: number;
  username: string;
  avatarUrl: string | null;
}

export interface AuthStatus {
  authorized: boolean;
  user: ScUser | null;
}

export interface Track {
  id: number;
  title: string;
  artist: string;
  artistId: number;
  artworkUrl: string | null;
  durationMs: number;
  permalinkUrl: string;
  streamable: boolean;
}

export interface ArtistProfile {
  id: number;
  username: string;
  avatarUrl: string | null;
  description: string | null;
  permalinkUrl: string;
  followersCount: number;
  trackCount: number;
  playlistCount: number;
}

export interface TrackPage {
  tracks: Track[];
  nextCursor: string | null;
}

export interface TrackStream {
  url: string;
  durationMs: number;
}

/**
 * Карточка полки домашней ленты — мини-плейлист (`system-playlist`, id треков
 * уже известны) или обычный альбом/плейлист (`playlist`, `trackIds` нужно
 * догружать отдельно через `scPlaylistTrackIds`).
 */
export interface PlaylistSummary {
  id: string;
  kind: string;
  title: string;
  artworkUrl: string | null;
  trackCount: number;
  trackIds: number[] | null;
}

export interface FeedSection {
  title: string;
  items: PlaylistSummary[];
}

export interface PlaylistPage {
  playlists: PlaylistSummary[];
  nextCursor: string | null;
}

export interface AudioDevice {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface CacheStats {
  audioBytes: number;
  audioLimitBytes: number;
}

export interface ZapretResult {
  added: string[];
  alreadyPresent: string[];
}

export interface WidgetStatus {
  enabled: boolean;
  port: number;
}

export interface DiscordPresence {
  details: string | null;
  state: string | null;
  largeImageUrl: string | null;
  buttonLabel: string | null;
  buttonUrl: string | null;
  startTimestampMs: number | null;
  endTimestampMs: number | null;
}

export type ScError = { kind: "invalidToken" } | { kind: "network"; message: string };

export function isScError(value: unknown): value is ScError {
  return typeof value === "object" && value !== null && "kind" in value;
}

export const api = {
  authStatus: () => invoke<AuthStatus>("auth_status"),
  authSetToken: (token: string) => invoke<ScUser>("auth_set_token", { token }),
  authLogout: () => invoke<void>("auth_logout"),
  scStream: (cursor?: string) => invoke<TrackPage>("sc_stream", { cursor: cursor ?? null }),
  scLikes: (cursor?: string) => invoke<TrackPage>("sc_likes", { cursor: cursor ?? null }),
  scSearchTracks: (query: string, cursor?: string) =>
    invoke<TrackPage>("sc_search_tracks", { query, cursor: cursor ?? null }),
  scSearchPlaylists: (query: string, cursor?: string) =>
    invoke<PlaylistPage>("sc_search_playlists", { query, cursor: cursor ?? null }),
  scUserProfile: (userId: number) => invoke<ArtistProfile>("sc_user_profile", { userId }),
  scUserTracks: (userId: number, cursor?: string) =>
    invoke<TrackPage>("sc_user_tracks", { userId, cursor: cursor ?? null }),
  scUserPlaylists: (userId: number, cursor?: string) =>
    invoke<PlaylistPage>("sc_user_playlists", { userId, cursor: cursor ?? null }),
  scTrackStream: (trackId: number) => invoke<TrackStream>("sc_track_stream", { trackId }),
  scLike: (trackId: number) => invoke<void>("sc_like", { trackId }),
  scUnlike: (trackId: number) => invoke<void>("sc_unlike", { trackId }),
  scHomeFeed: () => invoke<FeedSection[]>("sc_home_feed"),
  scResolveTracks: (ids: number[]) => invoke<Track[]>("sc_resolve_tracks", { ids }),
  scPlaylistTrackIds: (playlistId: number) =>
    invoke<number[]>("sc_playlist_track_ids", { playlistId }),
  audioLoadUrl: (trackId: number, url: string) => invoke<void>("audio_load_url", { trackId, url }),
  audioPrefetch: (trackId: number, url: string) => invoke<void>("audio_prefetch", { trackId, url }),
  audioPlay: () => invoke<void>("audio_play"),
  audioPause: () => invoke<void>("audio_pause"),
  audioStop: () => invoke<void>("audio_stop"),
  audioSeek: (positionSecs: number) => invoke<void>("audio_seek", { positionSecs }),
  audioSetVolume: (volume: number) => invoke<void>("audio_set_volume", { volume }),
  audioSetEq: (enabled: boolean, gains: number[]) =>
    invoke<void>("audio_set_eq", { enabled, gains }),
  audioListDevices: () => invoke<AudioDevice[]>("audio_list_devices"),
  audioSetDevice: (deviceId: string | null) => invoke<void>("audio_set_device", { deviceId }),
  cacheGetStats: () => invoke<CacheStats>("cache_get_stats"),
  cacheClearAudio: () => invoke<void>("cache_clear_audio"),
  cacheSetAudioLimit: (bytes: number) => invoke<void>("cache_set_audio_limit", { bytes }),
  backgroundGet: () => invoke<string | null>("background_get"),
  backgroundSet: (sourcePath: string) => invoke<string>("background_set", { sourcePath }),
  backgroundClear: () => invoke<void>("background_clear"),
  networkSetProxy: (proxyUrl: string | null) => invoke<void>("network_set_proxy", { proxyUrl }),
  networkCheck: () => invoke<void>("network_check"),
  zapretAddSoundcloudDomains: (batPath: string) =>
    invoke<ZapretResult>("zapret_add_soundcloud_domains", { batPath }),
  widgetGetStatus: () => invoke<WidgetStatus>("widget_get_status"),
  widgetSetEnabled: (enabled: boolean) => invoke<void>("widget_set_enabled", { enabled }),
  widgetSetPort: (port: number) => invoke<void>("widget_set_port", { port }),
  discordSetEnabled: (enabled: boolean) => invoke<void>("discord_set_enabled", { enabled }),
  discordUpdatePresence: (presence: DiscordPresence) =>
    invoke<void>("discord_update_presence", { presence }),
  discordClearPresence: () => invoke<void>("discord_clear_presence"),
};

import type { ScUser, Track } from "./api";

// Прод-бэкенд на VPS, за nginx с TLS — см. план, раздел про бэкенд.
// API_KEY зашит здесь же (не секрет уровня "приватный ключ пользователя" —
// общий пароль для доступа к самому сервису, аналог того, что уже сделано
// для Discord client_id).
const BASE_URL = "https://soundrain-api.botyfi.online";
const API_KEY = "-lomIz12lEv8e32dpLUeEbt4PUd-fnZj1LgpTf4LH6k";

export interface UserIdentity {
  scUserId: string;
  username: string;
  avatarUrl: string | null;
}

export function toIdentity(user: ScUser): UserIdentity {
  return { scUserId: String(user.id), username: user.username, avatarUrl: user.avatarUrl };
}

export interface PlaybackStateDto {
  currentTrack: Track | null;
  positionSecs: number;
  volume: number;
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const res = await fetch(url, { headers: { "X-Api-Key": API_KEY } });
  if (!res.ok) throw new Error(`backend GET ${path} -> ${res.status}`);
  return res.json();
}

async function put(path: string, body: unknown): Promise<void> {
  const res = await fetch(new URL(path, BASE_URL), {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Api-Key": API_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`backend PUT ${path} -> ${res.status}`);
}

async function del(path: string, params: Record<string, string>): Promise<void> {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const res = await fetch(url, { method: "DELETE", headers: { "X-Api-Key": API_KEY } });
  if (!res.ok) throw new Error(`backend DELETE ${path} -> ${res.status}`);
}

export const backendApi = {
  getQueue: (scUserId: string) => get<{ items: Track[] }>("/queue", { scUserId }),
  replaceQueue: (identity: UserIdentity, items: Track[]) => put("/queue", { ...identity, items }),
  getPlaybackState: (scUserId: string) =>
    get<PlaybackStateDto | null>("/playback-state", { scUserId }),
  savePlaybackState: (identity: UserIdentity, state: PlaybackStateDto) =>
    put("/playback-state", { ...identity, ...state }),
  getLikes: (scUserId: string) => get<{ items: Track[] }>("/likes", { scUserId }),
  setLike: (identity: UserIdentity, track: Track) =>
    put(`/likes/${track.id}`, { ...identity, track }),
  removeLike: (scUserId: string, scTrackId: string) => del(`/likes/${scTrackId}`, { scUserId }),
};

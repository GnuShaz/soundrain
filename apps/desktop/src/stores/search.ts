import { create } from "zustand";

export type SearchMode = "tracks" | "playlists";

interface SearchState {
  query: string;
  debounced: string;
  mode: SearchMode;
  setQuery: (query: string) => void;
  setDebounced: (debounced: string) => void;
  setMode: (mode: SearchMode) => void;
}

/**
 * Живёт вне Search.tsx нарочно: Radix `Tabs.Content` по умолчанию
 * размонтирует неактивную вкладку, а локальный useState умирал бы вместе с
 * ней — переключение на «Лайки» и обратно сбрасывало введённый запрос.
 * Сами результаты не нужно кэшировать отдельно — TanStack Query уже держит
 * их по ключу `debounced`, восстановление query/debounced достаточно, чтобы
 * получить их обратно из кэша при повторном монтировании.
 */
export const useSearchStore = create<SearchState>((set) => ({
  query: "",
  debounced: "",
  mode: "tracks",
  setQuery: (query) => set({ query }),
  setDebounced: (debounced) => set({ debounced }),
  setMode: (mode) => set({ mode }),
}));

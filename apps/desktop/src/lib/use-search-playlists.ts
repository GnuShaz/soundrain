import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "./api";

export function useSearchPlaylists(query: string) {
  const trimmed = query.trim();
  return useInfiniteQuery({
    queryKey: ["playlists", "search", trimmed],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      api.scSearchPlaylists(trimmed, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: trimmed.length > 0,
  });
}

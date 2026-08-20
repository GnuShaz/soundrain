import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "./api";

export function useSearchTracks(query: string) {
  const trimmed = query.trim();
  return useInfiniteQuery({
    queryKey: ["tracks", "search", trimmed],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      api.scSearchTracks(trimmed, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: trimmed.length > 0,
  });
}

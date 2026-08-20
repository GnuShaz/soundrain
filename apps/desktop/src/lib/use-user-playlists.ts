import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "./api";

export function useUserPlaylists(userId: number) {
  return useInfiniteQuery({
    queryKey: ["playlists", "user", userId],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      api.scUserPlaylists(userId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

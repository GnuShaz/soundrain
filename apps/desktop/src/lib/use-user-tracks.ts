import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "./api";

export function useUserTracks(userId: number) {
  return useInfiniteQuery({
    queryKey: ["tracks", "user", userId],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      api.scUserTracks(userId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

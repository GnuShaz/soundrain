import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export function useHomeFeed() {
  return useQuery({
    queryKey: ["home-feed"],
    queryFn: api.scHomeFeed,
  });
}

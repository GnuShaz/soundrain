import { useState } from "react";
import type { PlaylistSummary } from "../lib/api";
import { HomeFeed } from "./HomeFeed";
import { PlaylistView } from "./PlaylistView";

export function FeedTab() {
  const [openPlaylist, setOpenPlaylist] = useState<PlaylistSummary | null>(null);

  if (openPlaylist) {
    return <PlaylistView playlist={openPlaylist} onBack={() => setOpenPlaylist(null)} />;
  }
  return <HomeFeed onOpenPlaylist={setOpenPlaylist} />;
}

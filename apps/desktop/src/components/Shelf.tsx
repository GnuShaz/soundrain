import { useEffect, useRef } from "react";
import type { PlaylistSummary } from "../lib/api";
import { PlaylistCard } from "./PlaylistCard";

interface ShelfProps {
  title: string;
  items: PlaylistSummary[];
  onOpenPlaylist: (playlist: PlaylistSummary) => void;
}

export function Shelf({ title, items, onOpenPlaylist }: ShelfProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  // React привязывает onWheel как пассивный слушатель — preventDefault там
  // молча не сработает, поэтому нативный addEventListener с passive: false.
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    function handleWheel(event: WheelEvent) {
      if (event.deltaY === 0) return;
      (event.currentTarget as HTMLDivElement).scrollLeft += event.deltaY;
      event.preventDefault();
    }

    row.addEventListener("wheel", handleWheel, { passive: false });
    return () => row.removeEventListener("wheel", handleWheel);
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base text-text">{title}</h2>
      <div ref={rowRef} className="flex gap-4 overflow-x-auto pb-1">
        {items.map((item) => (
          <PlaylistCard key={item.id} playlist={item} onOpen={onOpenPlaylist} />
        ))}
      </div>
    </section>
  );
}

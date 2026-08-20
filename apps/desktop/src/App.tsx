import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { PlayerBar } from "./components/PlayerBar";
import { QueuePanel } from "./components/QueuePanel";
import { TitleBar } from "./components/TitleBar";
import { api, isScError } from "./lib/api";
import { applyBackground } from "./lib/background";
import { onAuthChanged } from "./lib/events";
import { hydrateLikesFromBackend } from "./lib/likes-sync";
import { hydrateFromBackend, wireBackendPersistence } from "./lib/persistence";
import { wirePrefetch } from "./lib/prefetch";
import { wireGlobalShortcuts } from "./lib/shortcuts";
import { wireDiscordPresence } from "./lib/wire-discord";
import { wireMediaEvents } from "./lib/wire-media-events";
import { wirePlayerEvents } from "./lib/wire-player-events";
import { ArtistPage } from "./pages/ArtistPage";
import { Feed } from "./pages/Feed";
import { Login } from "./pages/Login";
import { useNavigationStore } from "./stores/navigation";

function App() {
  const queryClient = useQueryClient();
  const [queueOpen, setQueueOpen] = useState(false);
  const openArtistId = useNavigationStore((s) => s.openArtistId);
  const closeArtist = useNavigationStore((s) => s.closeArtist);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["auth-status"],
    queryFn: api.authStatus,
  });

  useEffect(() => {
    wirePlayerEvents();
    wireMediaEvents();
    wireDiscordPresence();
    wireGlobalShortcuts();
    wirePrefetch();
    api.backgroundGet().then((dataUri) => {
      if (dataUri) applyBackground(dataUri);
    });
    const unlisten = onAuthChanged((status) => {
      queryClient.setQueryData(["auth-status"], status);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [queryClient]);

  const user = data?.authorized ? data.user : null;
  useEffect(() => {
    if (!user) return;
    hydrateFromBackend(user).then(() => wireBackendPersistence(user));
    hydrateLikesFromBackend(user);
  }, [user]);

  let content: React.ReactNode;

  if (isLoading) {
    content = <main className="flex-1 bg-bg" />;
  } else if (isError) {
    // Сетевая ошибка при старте — не путать с "не вошли": токен мог остаться
    // валидным, просто SoundCloud недоступен. Разлогинивать в этом случае нельзя.
    const message =
      isScError(error) && error.kind === "network" ? error.message : "неизвестная ошибка";
    content = (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
        <p className="text-sm text-danger">Нет связи с SoundCloud: {message}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="border border-hairline px-4 py-2 text-sm text-text hover:border-accent"
        >
          Повторить
        </button>
      </main>
    );
  } else if (!data?.authorized || !data.user) {
    content = <Login />;
  } else {
    content = (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          {openArtistId ? (
            <ArtistPage artistId={openArtistId} onBack={closeArtist} />
          ) : (
            <Feed
              user={data.user}
              onLogout={() =>
                api
                  .authLogout()
                  .then(() =>
                    queryClient.setQueryData(["auth-status"], { authorized: false, user: null }),
                  )
              }
            />
          )}
          {queueOpen && <QueuePanel onClose={() => setQueueOpen(false)} />}
        </div>
        <PlayerBar queueOpen={queueOpen} onToggleQueue={() => setQueueOpen((v) => !v)} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      {content}
    </div>
  );
}

export default App;

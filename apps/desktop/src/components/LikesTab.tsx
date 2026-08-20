import { useQuery } from "@tanstack/react-query";
import type { ScUser } from "../lib/api";
import { backendApi } from "../lib/backend-api";
import { TrackCardGridView } from "./TrackCardGridView";

interface LikesTabProps {
  user: ScUser;
}

/**
 * Лайки — «на уровне пользователя»: свои, хранятся только в нашем бэкенде
 * (см. stores/likes.ts), не синхронизируются с настоящим SoundCloud-аккаунтом
 * (их API для лайка блокирует запросы не из браузера — см. план, шаг 6).
 */
export function LikesTab({ user }: LikesTabProps) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["local-likes", user.id],
    queryFn: () => backendApi.getLikes(String(user.id)),
  });

  return (
    <TrackCardGridView
      tracks={data?.items ?? []}
      isLoading={isLoading}
      isError={isError}
      error={error}
      onRetry={() => refetch()}
      emptyTitle="Пока нет лайков"
      emptyHint="Отмеченные треки появятся здесь"
    />
  );
}

import { create } from "zustand";

/**
 * Страница исполнителя открывается по клику из многих мест (карточки
 * треков, строки списков, плеер-бар, очередь) в разных вкладках Ленты —
 * тащить колбэк пропсами через все эти слои было бы избыточно, поэтому
 * состояние здесь, а не в App.tsx напрямую.
 */
interface NavigationState {
  openArtistId: number | null;
  openArtist: (id: number) => void;
  closeArtist: () => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  openArtistId: null,
  openArtist: (id) => set({ openArtistId: id }),
  closeArtist: () => set({ openArtistId: null }),
}));

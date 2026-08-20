import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "../lib/api";
import { EQ_PRESETS } from "../lib/eq-presets";

const BAND_COUNT = 10;
const FLAT_GAINS = EQ_PRESETS[0].gains;

interface EqualizerState {
  enabled: boolean;
  gains: number[];
  activePreset: string | null;
  setEnabled: (enabled: boolean) => void;
  setGain: (index: number, value: number) => void;
  applyPreset: (name: string) => void;
  reset: () => void;
}

function pushToRust(enabled: boolean, gains: number[]) {
  api.audioSetEq(enabled, gains).catch(() => {});
}

function matchPreset(gains: number[]): string | null {
  const preset = EQ_PRESETS.find((p) => p.gains.every((g, i) => g === gains[i]));
  return preset?.name ?? null;
}

/**
 * Хранится в localStorage (не в бэкенде — как и остальные будущие
 * настройки, единый источник правды для них ещё не решён, см. план,
 * пункт про Настройки). При каждом изменении гейнов/тумблера сразу шлём в
 * Rust (`audio_set_eq`) — EqState там общий на всё приложение и переживает
 * смену трека сам по себе, но при СТАРТЕ приложения он пустой, поэтому
 * `onRehydrateStorage` синхронизирует его с тем, что восстановилось из
 * localStorage.
 */
export const useEqualizerStore = create<EqualizerState>()(
  persist(
    (set, get) => ({
      enabled: false,
      gains: Array<number>(BAND_COUNT).fill(0),
      activePreset: "Ровный",

      setEnabled: (enabled) => {
        set({ enabled });
        pushToRust(enabled, get().gains);
      },

      setGain: (index, value) => {
        const gains = [...get().gains];
        gains[index] = value;
        set({ gains, activePreset: matchPreset(gains) });
        pushToRust(get().enabled, gains);
      },

      applyPreset: (name) => {
        const preset = EQ_PRESETS.find((p) => p.name === name);
        if (!preset) return;
        set({ gains: [...preset.gains], activePreset: name });
        pushToRust(get().enabled, preset.gains);
      },

      reset: () => {
        set({ gains: [...FLAT_GAINS], activePreset: "Ровный" });
        pushToRust(get().enabled, FLAT_GAINS);
      },
    }),
    {
      name: "soundrain-equalizer",
      onRehydrateStorage: () => (state) => {
        if (state) pushToRust(state.enabled, state.gains);
      },
    },
  ),
);

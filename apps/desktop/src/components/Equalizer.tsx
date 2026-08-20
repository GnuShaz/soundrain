import * as Dialog from "@radix-ui/react-dialog";
import * as Slider from "@radix-ui/react-slider";
import { AudioLines, Power, RotateCcw, X } from "lucide-react";
import { EQ_BAND_FREQUENCIES, EQ_PRESETS, formatBandFrequency } from "../lib/eq-presets";
import { useEqualizerStore } from "../stores/equalizer";

interface EqualizerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function Equalizer({ open, onOpenChange }: EqualizerProps) {
  const { enabled, gains, activePreset, setEnabled, setGain, applyPreset, reset } =
    useEqualizerStore();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-bg/70" />
        <Dialog.Content className="fixed top-1/2 left-1/2 w-[640px] -translate-x-1/2 -translate-y-1/2 border border-hairline bg-surface p-6">
          <div className="flex items-center gap-2">
            <AudioLines size={18} className="shrink-0 text-muted" />
            <Dialog.Title className="flex-1 text-base text-text">Эквалайзер</Dialog.Title>
            <button
              type="button"
              onClick={() => setEnabled(!enabled)}
              aria-label={enabled ? "Выключить эквалайзер" : "Включить эквалайзер"}
              aria-pressed={enabled}
              className={`shrink-0 border p-1.5 ${
                enabled ? "border-accent text-accent" : "border-hairline text-muted hover:text-text"
              }`}
            >
              <Power size={14} />
            </button>
            <button
              type="button"
              onClick={reset}
              aria-label="Сбросить эквалайзер"
              className="shrink-0 border border-hairline p-1.5 text-muted hover:text-text"
            >
              <RotateCcw size={14} />
            </button>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Закрыть"
                className="shrink-0 border border-hairline p-1.5 text-muted hover:text-text"
              >
                <X size={14} />
              </button>
            </Dialog.Close>
          </div>

          <div className={`mt-8 flex justify-between gap-2 ${enabled ? "" : "opacity-40"}`}>
            {EQ_BAND_FREQUENCIES.map((freq, index) => {
              const gain = gains[index] ?? 0;
              return (
                <div key={freq} className="flex flex-col items-center gap-2">
                  <span
                    className={`font-mono text-xs ${
                      enabled && gain !== 0 ? "text-accent" : "text-muted"
                    }`}
                  >
                    {gain > 0 ? "+" : ""}
                    {gain.toFixed(1)}
                  </span>
                  <Slider.Root
                    orientation="vertical"
                    className="relative flex h-40 w-4 touch-none select-none justify-center data-[disabled]:cursor-not-allowed"
                    min={-12}
                    max={12}
                    step={0.5}
                    value={[gain]}
                    disabled={!enabled}
                    onValueChange={([value]) => setGain(index, value)}
                  >
                    <Slider.Track className="relative h-full w-px bg-hairline">
                      <Slider.Range
                        className={`absolute w-full ${enabled ? "bg-accent" : "bg-muted"}`}
                      />
                    </Slider.Track>
                    <Slider.Thumb
                      className={`block h-2.5 w-2.5 outline-none ${enabled ? "bg-accent" : "bg-muted"}`}
                    />
                  </Slider.Root>
                  <span className="font-mono text-xs text-muted">{formatBandFrequency(freq)}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-8 flex flex-col gap-3">
            <span className="text-sm text-muted">Пресет</span>
            <div className="flex flex-wrap gap-2">
              {EQ_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => applyPreset(preset.name)}
                  className={`border px-3 py-1.5 text-sm ${
                    activePreset === preset.name
                      ? "border-accent text-accent"
                      : "border-hairline text-muted hover:text-text"
                  }`}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

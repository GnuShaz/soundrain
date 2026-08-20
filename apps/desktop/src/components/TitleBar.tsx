import { getCurrentWindow, type Window as TauriWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import logo from "../assets/logo.png";

export function TitleBar() {
  // Ленивая инициализация внутри компонента, а не на уровне модуля: если
  // мост Tauri почему-то ещё не готов, `getCurrentWindow()` бросает
  // исключение — на уровне модуля это уронило бы всё дерево React без
  // возможности восстановиться, здесь же ловим и просто не рисуем кнопки
  // управления окном, а не всё приложение.
  const [appWindow] = useState<TauriWindow | null>(() => {
    try {
      return getCurrentWindow();
    } catch {
      return null;
    }
  });
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!appWindow) return;
    const update = () => {
      appWindow.isMaximized().then(setIsMaximized);
    };
    update();
    const unlisten = appWindow.onResized(update);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [appWindow]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: data-tauri-drag-region — рабочая область перетаскивания окна, не интерактивный элемент в обычном смысле
    <div
      data-tauri-drag-region
      onDoubleClick={() => appWindow?.toggleMaximize()}
      className="flex h-8 shrink-0 items-center justify-between bg-bg pl-3"
    >
      <div data-tauri-drag-region className="flex items-center gap-2">
        <img src={logo} alt="" className="h-5 w-5" draggable={false} />
        <span className="text-xs text-muted">SoundRain</span>
      </div>

      {appWindow && (
        <div className="flex h-full shrink-0">
          <button
            type="button"
            onClick={() => appWindow.minimize()}
            aria-label="Свернуть"
            className="flex h-full w-11 items-center justify-center text-muted hover:bg-surface hover:text-text"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            onClick={() => appWindow.toggleMaximize()}
            aria-label={isMaximized ? "Восстановить" : "Развернуть"}
            className="flex h-full w-11 items-center justify-center text-muted hover:bg-surface hover:text-text"
          >
            <Square size={11} />
          </button>
          <button
            type="button"
            onClick={() => appWindow.close()}
            aria-label="Закрыть"
            className="flex h-full w-11 items-center justify-center text-muted hover:bg-danger hover:text-bg"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

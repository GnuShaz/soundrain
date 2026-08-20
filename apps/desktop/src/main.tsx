import { QueryClientProvider } from "@tanstack/react-query";
import { getCurrentWindow } from "@tauri-apps/api/window";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { queryClient } from "./lib/query-client";
import { MiniPlayerApp } from "./MiniPlayerApp";
import "./styles/index.css";

// Своё окно без системного хрома — браузерное контекстное меню (Inspect,
// Reload и т.д.) здесь ни к месту нигде в приложении.
document.addEventListener("contextmenu", (event) => event.preventDefault());

// Мини-плеер — тот же бандл в отдельном Tauri-окне (см. src-tauri/src/miniplayer.rs);
// какой корневой компонент рендерить, решаем по лейблу окна. Ленивая
// try-catch-проверка — тот же паттерн, что и в TitleBar.tsx: если мост
// Tauri почему-то не готов, считаем это главным окном, а не роняем всё.
let isMiniPlayer = false;
try {
  isMiniPlayer = getCurrentWindow().label === "mini-player";
} catch {
  isMiniPlayer = false;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isMiniPlayer ? (
      <MiniPlayerApp />
    ) : (
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    )}
  </React.StrictMode>,
);

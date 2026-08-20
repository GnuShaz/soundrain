/**
 * Фоновая картинка приложения — применяется не отдельным слоем поверх
 * интерфейса, а переопределением `--color-bg`/`--color-surface` в rgba:
 * эти же переменные использует каждый `bg-bg`/`bg-surface` по всему
 * приложению (Tailwind `@theme inline` ссылается на них напрямую, не
 * инлайнит значение при сборке), поэтому одна точка переопределения делает
 * все уже построенные экраны полупрозрачными разом, без правки каждого
 * компонента по отдельности. Сама картинка — на `body` через `--bg-image`
 * (см. styles/index.css), просвечивает сквозь полупрозрачные панели.
 */

const BG_COLOR_RGBA = "rgba(19, 17, 14, 0.85)"; // #13110e при ~85% непрозрачности
const SURFACE_COLOR_RGBA = "rgba(28, 25, 21, 0.85)"; // #1c1915 при ~85% непрозрачности

export function applyBackground(dataUri: string) {
  const root = document.documentElement.style;
  root.setProperty("--bg-image", `url("${dataUri}")`);
  root.setProperty("--color-bg", BG_COLOR_RGBA);
  root.setProperty("--color-surface", SURFACE_COLOR_RGBA);
}

export function clearBackground() {
  const root = document.documentElement.style;
  root.removeProperty("--bg-image");
  root.removeProperty("--color-bg");
  root.removeProperty("--color-surface");
}

export function formatSeconds(totalSecondsInput: number): string {
  const totalSeconds = Math.max(0, Math.round(totalSecondsInput));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatDuration(ms: number): string {
  return formatSeconds(ms / 1000);
}

/** "1234" -> "1.2K", "980" -> "980" — счётчики на странице исполнителя. */
export function formatCount(count: number): string {
  if (count < 1000) return String(count);
  const value = count / 1000;
  return `${value.toFixed(value >= 10 ? 0 : 1)}K`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const units = ["КБ", "МБ", "ГБ"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

import * as Slider from "@radix-ui/react-slider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ArrowLeft,
  Check,
  Globe,
  HardDrive,
  Headphones,
  Image as ImageIcon,
  MessageCircle,
  Radio,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { applyBackground, clearBackground } from "../lib/background";
import { formatBytes } from "../lib/formatters";
import { type DiscordMode, useSettingsStore } from "../stores/settings";

/**
 * Группы слева — по референсу `settings.png` (пользователь прислал в корень
 * репо): вертикальная навигация с иконками, активная — акцентная полоса
 * слева. Группы добавляются сюда по мере реализации разделов, не заранее
 * пустыми заглушками.
 */
type SettingsGroupId = "audio" | "storage" | "background" | "network" | "widget" | "discord";

interface SettingsGroupDef {
  id: SettingsGroupId;
  label: string;
  icon: typeof Headphones;
}

const GROUPS: SettingsGroupDef[] = [
  { id: "audio", label: "Звук", icon: Headphones },
  { id: "background", label: "Фон", icon: ImageIcon },
  { id: "storage", label: "Хранилище", icon: HardDrive },
  { id: "network", label: "Сеть", icon: Globe },
  { id: "widget", label: "OBS", icon: Radio },
  { id: "discord", label: "Discord", icon: MessageCircle },
];

interface SettingsProps {
  onBack: () => void;
}

export function Settings({ onBack }: SettingsProps) {
  const [groupId, setGroupId] = useState<SettingsGroupId>("audio");
  const activeGroup = GROUPS.find((g) => g.id === groupId) ?? GROUPS[0];

  return (
    <div className="flex flex-1 overflow-hidden bg-bg text-text">
      <nav className="flex w-56 shrink-0 flex-col gap-1 border-r border-hairline p-4">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 flex w-fit items-center gap-1 text-sm text-muted hover:text-text"
        >
          <ArrowLeft size={14} />
          Назад
        </button>

        {GROUPS.map((group) => {
          const Icon = group.icon;
          const active = group.id === groupId;
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => setGroupId(group.id)}
              className={`flex items-center gap-2.5 border-l-2 px-3 py-2 text-left text-sm transition-colors ${
                active ? "border-accent text-text" : "border-transparent text-muted hover:text-text"
              }`}
            >
              <Icon size={15} className={active ? "text-accent" : "text-muted"} />
              {group.label}
            </button>
          );
        })}
      </nav>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <p className="font-mono text-xs tracking-widest text-muted">НАСТРОЙКИ</p>
        <h1 className="mt-1 text-xl text-text">{activeGroup.label}</h1>

        <div className="mt-6 flex max-w-lg flex-col gap-4">
          {groupId === "audio" && <AudioSection />}
          {groupId === "background" && <BackgroundSection />}
          {groupId === "storage" && <StorageSection />}
          {groupId === "network" && <NetworkSection />}
          {groupId === "widget" && <WidgetSection />}
          {groupId === "discord" && <DiscordSection />}
        </div>
      </div>
    </div>
  );
}

function AudioSection() {
  const {
    data: devices,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["audio-devices"],
    queryFn: api.audioListDevices,
  });
  const audioDeviceId = useSettingsStore((s) => s.audioDeviceId);
  const setAudioDeviceId = useSettingsStore((s) => s.setAudioDeviceId);

  return (
    <section className="flex flex-col gap-3 border border-hairline bg-surface p-5">
      <div className="flex items-center gap-2">
        <Headphones size={16} className="text-muted" />
        <h2 className="text-sm text-text">Устройство вывода</h2>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Загружаем список устройств…</p>
      ) : isError ? (
        <p className="text-sm text-danger">Не удалось получить список устройств</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <DeviceRow
            label="Системное по умолчанию"
            active={audioDeviceId === null}
            onClick={() => setAudioDeviceId(null)}
          />
          {devices?.map((device) => (
            <DeviceRow
              key={device.id}
              label={device.name}
              active={audioDeviceId === device.id}
              onClick={() => setAudioDeviceId(device.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Применяется не к самой картинке, а переопределением `--color-bg`/
 * `--color-surface` в rgba по всему приложению (см. `lib/background.ts`) —
 * по решению пользователя, чтобы картинка просвечивала сквозь уже
 * построенные экраны, а не только за их пределами.
 */
function BackgroundSection() {
  const [preview, setPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    api.backgroundGet().then((dataUri) => {
      setPreview(dataUri);
      setIsLoading(false);
    });
  }, []);

  const handlePick = async () => {
    const path = await open({
      multiple: false,
      filters: [{ name: "Изображения", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
    });
    if (typeof path !== "string") return;

    setIsBusy(true);
    try {
      const dataUri = await api.backgroundSet(path);
      applyBackground(dataUri);
      setPreview(dataUri);
    } finally {
      setIsBusy(false);
    }
  };

  const handleClear = async () => {
    setIsBusy(true);
    try {
      await api.backgroundClear();
      clearBackground();
      setPreview(null);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 border border-hairline bg-surface p-5">
      <div className="flex items-center gap-2">
        <ImageIcon size={16} className="text-muted" />
        <h2 className="text-sm text-text">Фоновая картинка</h2>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Загружаем…</p>
      ) : (
        <>
          {preview && (
            <div className="h-32 w-full overflow-hidden border border-hairline">
              <img src={preview} alt="" className="h-full w-full object-cover" />
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePick}
              disabled={isBusy}
              className="border border-hairline px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-text disabled:opacity-40"
            >
              {preview ? "Заменить" : "Выбрать файл"}
            </button>
            {preview && (
              <button
                type="button"
                onClick={handleClear}
                disabled={isBusy}
                className="border border-hairline px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-text disabled:opacity-40"
              >
                Убрать
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

const MIN_LIMIT_BYTES = 256 * 1024 * 1024; // 256 МБ
const MAX_LIMIT_BYTES = 10 * 1024 * 1024 * 1024; // 10 ГБ
const LIMIT_STEP_BYTES = 256 * 1024 * 1024;

/**
 * Только «Аудио» — на первую итерацию (см. план, пункт 15). Картинки
 * обложек сейчас отдаются WebView как обычные `<img>`, свой явный кэш для
 * них не заведён; «защищённый» кэш лайков (не участвующий в LRU) — тоже
 * отдельная работа, требует второго менеджера кэша. Обе части осознанно
 * отложены, не притворяемся, что они есть.
 */
function StorageSection() {
  const queryClient = useQueryClient();
  const {
    data: stats,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["cache-stats"],
    queryFn: api.cacheGetStats,
  });
  const [dragLimitBytes, setDragLimitBytes] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);

  const usedBytes = stats?.audioBytes ?? 0;
  const displayedLimit = dragLimitBytes ?? stats?.audioLimitBytes ?? MIN_LIMIT_BYTES;
  const usedFraction = Math.min(1, usedBytes / displayedLimit);

  const handleClear = async () => {
    setClearing(true);
    try {
      await api.cacheClearAudio();
      await queryClient.invalidateQueries({ queryKey: ["cache-stats"] });
    } finally {
      setClearing(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 border border-hairline bg-surface p-5">
      <div className="flex items-center gap-2">
        <HardDrive size={16} className="text-muted" />
        <h2 className="text-sm text-text">Аудио</h2>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Считаем размер кэша…</p>
      ) : isError ? (
        <p className="text-sm text-danger">Не удалось получить размер кэша</p>
      ) : (
        <>
          {/* «Занято» — отдельный, самостоятельный факт: не пересчитывается
              и не двигается, пока тянешь слайдер лимита ниже, иначе на глаз
              не понять, какое из двух чисел вообще меняется. */}
          <div>
            <p className="text-xs text-muted">Занято</p>
            <p className="font-mono text-lg text-text">{formatBytes(usedBytes)}</p>
          </div>

          <div className="h-1 w-full bg-hairline">
            <div
              className="h-full bg-accent transition-[width]"
              style={{ width: `${usedFraction * 100}%` }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <p className="text-xs text-muted">Лимит кэша</p>
              <p className="font-mono text-sm text-text">{formatBytes(displayedLimit)}</p>
            </div>
            <Slider.Root
              className="relative flex h-4 touch-none select-none items-center"
              min={MIN_LIMIT_BYTES}
              max={MAX_LIMIT_BYTES}
              step={LIMIT_STEP_BYTES}
              value={[displayedLimit]}
              onValueChange={([value]) => setDragLimitBytes(value)}
              onValueCommit={([value]) => {
                setDragLimitBytes(null);
                api
                  .cacheSetAudioLimit(value)
                  .then(() => queryClient.invalidateQueries({ queryKey: ["cache-stats"] }));
              }}
            >
              <Slider.Track className="relative h-px flex-1 bg-hairline">
                <Slider.Range className="absolute h-full bg-muted" />
              </Slider.Track>
              <Slider.Thumb className="block h-2.5 w-2.5 bg-muted outline-none" />
            </Slider.Root>
          </div>

          <button
            type="button"
            onClick={handleClear}
            disabled={clearing || usedBytes === 0}
            className="w-fit border border-hairline px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-text disabled:opacity-40"
          >
            {clearing ? "Чистим…" : "Очистить"}
          </button>
        </>
      )}
    </section>
  );
}

type NetworkMode = "direct" | "proxy" | "zapret";
type CheckStatus = "idle" | "checking" | "ok" | "error";

function NetworkSection() {
  const proxyUrl = useSettingsStore((s) => s.proxyUrl);
  const setProxyUrl = useSettingsStore((s) => s.setProxyUrl);
  const [mode, setMode] = useState<NetworkMode>(proxyUrl ? "proxy" : "direct");
  const [inputValue, setInputValue] = useState(proxyUrl ?? "");
  const [checkStatus, setCheckStatus] = useState<CheckStatus>("idle");
  const [checkError, setCheckError] = useState<string | null>(null);

  const commitProxyUrl = (value: string) => {
    const trimmed = value.trim();
    setProxyUrl(trimmed.length > 0 ? trimmed : null);
  };

  const handleModeChange = (nextMode: NetworkMode) => {
    setMode(nextMode);
    setCheckStatus("idle");
    if (nextMode === "direct") {
      setInputValue("");
      setProxyUrl(null);
    }
  };

  const handleCheck = async () => {
    setCheckStatus("checking");
    setCheckError(null);
    try {
      await api.networkCheck();
      setCheckStatus("ok");
    } catch (e) {
      setCheckStatus("error");
      setCheckError(typeof e === "string" ? e : "не удалось проверить соединение");
    }
  };

  return (
    <section className="flex flex-col gap-4 border border-hairline bg-surface p-5">
      <div className="flex items-center gap-2">
        <Globe size={16} className="text-muted" />
        <h2 className="text-sm text-text">Соединение с SoundCloud</h2>
      </div>

      <div className="flex gap-1">
        {(
          [
            { id: "direct", label: "Напрямую" },
            { id: "proxy", label: "Через прокси" },
            { id: "zapret", label: "Zapret" },
          ] as const
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => handleModeChange(option.id)}
            className={`border px-3 py-1.5 text-sm ${
              mode === option.id
                ? "border-accent text-accent"
                : "border-hairline text-muted hover:text-text"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {mode === "proxy" && (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onBlur={() => commitProxyUrl(inputValue)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitProxyUrl(inputValue);
                event.currentTarget.blur();
              }
            }}
            placeholder="socks5://127.0.0.1:1080"
            className="w-full border border-hairline bg-bg px-3 py-2 text-sm text-text placeholder:text-muted/60 outline-none focus:border-accent"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCheck}
              disabled={checkStatus === "checking" || !proxyUrl}
              className="w-fit border border-hairline px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-text disabled:opacity-40"
            >
              {checkStatus === "checking" ? "Проверяем…" : "Проверить соединение"}
            </button>
            {checkStatus === "ok" && (
              <span className="text-sm text-accent">Соединение работает</span>
            )}
            {checkStatus === "error" && (
              <span className="text-sm text-danger">{checkError ?? "Не удалось подключиться"}</span>
            )}
          </div>
        </div>
      )}

      {mode === "zapret" && <ZapretSection />}
    </section>
  );
}

type ZapretStatus = "idle" | "running" | "done" | "error";

/**
 * Не проксирование — помощь с настройкой [Flowseal/zapret-discord-youtube]
 * (https://github.com/Flowseal/zapret-discord-youtube): пользователь
 * указывает `.bat`, которым запускает zapret, приложение дописывает домены
 * SoundCloud в его пользовательский хостлист (`zapret_add_soundcloud_domains`,
 * формат/расположение файла проверены по исходникам zapret, не
 * предположены). Сам процесс `winws.exe`/службу не трогаем — это отдельный
 * шаг пользователя, требует прав администратора.
 */
function ZapretSection() {
  const batPath = useSettingsStore((s) => s.zapretBatPath);
  const setBatPath = useSettingsStore((s) => s.setZapretBatPath);
  const [status, setStatus] = useState<ZapretStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const apply = async (path: string) => {
    setStatus("running");
    setMessage(null);
    try {
      const result = await api.zapretAddSoundcloudDomains(path);
      setBatPath(path);
      setStatus("done");
      setMessage(
        result.added.length > 0
          ? `Добавлено в список zapret: ${result.added.join(", ")}`
          : "Домены SoundCloud уже были в списке zapret",
      );
    } catch (e) {
      setStatus("error");
      setMessage(typeof e === "string" ? e : "не удалось обновить список zapret");
    }
  };

  const handlePick = async () => {
    const path = await open({
      multiple: false,
      filters: [{ name: "Zapret launcher", extensions: ["bat"] }],
    });
    if (typeof path !== "string") return;
    apply(path);
  };

  return (
    <div className="flex flex-col gap-3 border-t border-hairline pt-4">
      <p className="text-sm text-muted">
        Укажите .bat-файл, которым вы запускаете zapret (например{" "}
        <span className="font-mono text-text">general.bat</span>) — добавим домены SoundCloud в его
        пользовательский список, если их там ещё нет. Работает только на Windows.
      </p>

      {batPath && <p className="truncate font-mono text-xs text-muted">{batPath}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handlePick}
          disabled={status === "running"}
          className="w-fit border border-hairline px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-text disabled:opacity-40"
        >
          {status === "running" ? "Добавляем…" : batPath ? "Выбрать другой файл" : "Выбрать файл"}
        </button>
        {batPath && (
          <button
            type="button"
            onClick={() => apply(batPath)}
            disabled={status === "running"}
            className="w-fit border border-hairline px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-text disabled:opacity-40"
          >
            Повторить
          </button>
        )}
      </div>

      {status === "done" && <p className="text-sm text-accent">{message}</p>}
      {status === "error" && <p className="text-sm text-danger">{message}</p>}
    </div>
  );
}

/**
 * Локальный HTTP-сервер (`tiny_http`, план пункт 19) — не занимает порт,
 * пока выключен. OBS Browser Source умеет открывать только настоящий
 * `http://`, поэтому виджет не встроен в основной вебвью, а отдаётся
 * отдельной статической страницей (`widget/widget.html`), которую и
 * копируем сюда ссылкой.
 */
function WidgetSection() {
  const queryClient = useQueryClient();
  const { data: status, isLoading } = useQuery({
    queryKey: ["widget-status"],
    queryFn: api.widgetGetStatus,
  });
  const [portInput, setPortInput] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (status) setPortInput(String(status.port));
  }, [status]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["widget-status"] });

  const handleToggle = async () => {
    if (!status) return;
    await api.widgetSetEnabled(!status.enabled);
    refresh();
  };

  const commitPort = async () => {
    const port = Number(portInput);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setPortInput(String(status?.port ?? DEFAULT_WIDGET_PORT));
      return;
    }
    await api.widgetSetPort(port);
    refresh();
  };

  const url = status ? `http://127.0.0.1:${status.port}/widget` : "";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Буфер обмена недоступен — URL всё равно виден в поле, копируется вручную.
    }
  };

  return (
    <section className="flex flex-col gap-4 border border-hairline bg-surface p-5">
      <div className="flex items-center gap-2">
        <Radio size={16} className="text-muted" />
        <h2 className="text-sm text-text">Виджет «Сейчас играет» для OBS</h2>
      </div>

      <p className="text-sm text-muted">
        Локальная страница с обложкой, названием и прогрессом трека — добавьте её в OBS как Browser
        Source, обновляется вживую раз в секунду.
      </p>

      <button
        type="button"
        onClick={handleToggle}
        disabled={isLoading}
        className={`w-fit border px-3 py-1.5 text-sm ${
          status?.enabled
            ? "border-accent text-accent"
            : "border-hairline text-muted hover:text-text"
        }`}
      >
        {status?.enabled ? "Включён" : "Выключен"}
      </button>

      {status?.enabled && (
        <>
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted">Порт</p>
            <input
              type="text"
              inputMode="numeric"
              value={portInput}
              onChange={(event) => setPortInput(event.target.value)}
              onBlur={commitPort}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  commitPort();
                  event.currentTarget.blur();
                }
              }}
              className="w-32 border border-hairline bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
          </div>

          <div className="flex items-center gap-3">
            <code className="truncate border border-hairline bg-bg px-3 py-2 text-xs text-muted">
              {url}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="w-fit shrink-0 border border-hairline px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-text"
            >
              {copied ? "Скопировано" : "Скопировать"}
            </button>
          </div>

          <p className="text-xs text-muted">
            В настройках Browser Source в OBS: ширина 480, высота 140. Фон уже прозрачный, ничего
            дополнительно настраивать не нужно.
          </p>
        </>
      )}
    </section>
  );
}

const DISCORD_MODES: { id: DiscordMode; label: string }[] = [
  { id: "track", label: "Трек" },
  { id: "artist", label: "Только автора" },
  { id: "activity", label: "Только активность" },
];

/**
 * По референсу `discord.png` (пользователь прислал в корень репо):
 * тумблер вкл/выкл, сегмент-контрол «Что отображать», отдельный тумблер
 * кнопки-ссылки на трек. Rust ничего не знает о режимах — присутствие
 * пересобирается и пересылается заново при любом изменении здесь
 * (`lib/wire-discord.ts`, подписан на этот стор).
 */
function DiscordSection() {
  const discordEnabled = useSettingsStore((s) => s.discordEnabled);
  const setDiscordEnabled = useSettingsStore((s) => s.setDiscordEnabled);
  const discordMode = useSettingsStore((s) => s.discordMode);
  const setDiscordMode = useSettingsStore((s) => s.setDiscordMode);
  const discordButtonEnabled = useSettingsStore((s) => s.discordButtonEnabled);
  const setDiscordButtonEnabled = useSettingsStore((s) => s.setDiscordButtonEnabled);

  return (
    <section className="flex flex-col gap-4 border border-hairline bg-surface p-5">
      <div className="flex items-center gap-2">
        <MessageCircle size={16} className="text-muted" />
        <h2 className="text-sm text-text">Статус прослушивания</h2>
      </div>

      <p className="text-sm text-muted">
        Показывать текущий трек с SoundCloud в статусе Discord. Работает, только пока запущен сам
        Discord.
      </p>

      <button
        type="button"
        onClick={() => setDiscordEnabled(!discordEnabled)}
        className={`w-fit border px-3 py-1.5 text-sm ${
          discordEnabled
            ? "border-accent text-accent"
            : "border-hairline text-muted hover:text-text"
        }`}
      >
        {discordEnabled ? "Включён" : "Выключен"}
      </button>

      {discordEnabled && (
        <>
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted">Что отображать</p>
            <div className="flex gap-1">
              {DISCORD_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setDiscordMode(mode.id)}
                  className={`border px-3 py-1.5 text-sm ${
                    discordMode === mode.id
                      ? "border-accent text-accent"
                      : "border-hairline text-muted hover:text-text"
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setDiscordButtonEnabled(!discordButtonEnabled)}
            className={`flex w-fit items-center justify-between gap-3 border px-3 py-2 text-left text-sm ${
              discordButtonEnabled
                ? "border-accent text-accent"
                : "border-hairline text-muted hover:text-text"
            }`}
          >
            Кнопка «Открыть на SoundCloud»
            {discordButtonEnabled && <Check size={14} className="shrink-0" />}
          </button>
        </>
      )}
    </section>
  );
}

const DEFAULT_WIDGET_PORT = 47100;

interface DeviceRowProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function DeviceRow({ label, active, onClick }: DeviceRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between border px-3 py-2 text-left text-sm ${
        active ? "border-accent text-accent" : "border-hairline text-muted hover:text-text"
      }`}
    >
      <span className="truncate">{label}</span>
      {active && <Check size={14} className="shrink-0" />}
    </button>
  );
}

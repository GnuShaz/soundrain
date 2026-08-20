import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { type FormEvent, useState } from "react";
import logo from "../assets/logo.png";
import { api, isScError } from "../lib/api";

const STEPS = [
  "Откройте soundcloud.com и войдите в свой аккаунт",
  "Откройте инструменты разработчика (F12)",
  "Перейдите в Application → Storage → Cookies → https://soundcloud.com",
  "Найдите ключ oauth_token и скопируйте его значение",
];

export function Login() {
  const [token, setToken] = useState("");
  const [reveal, setReveal] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (value: string) => api.authSetToken(value),
    onSuccess: (user) => {
      queryClient.setQueryData(["auth-status"], { authorized: true, user });
    },
  });

  const error = isScError(mutation.error) ? mutation.error : null;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = token.trim();
    if (trimmed.length === 0) return;
    mutation.mutate(trimmed);
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-bg px-6">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 flex items-center justify-center gap-2">
          <img src={logo} alt="" className="h-10 w-10" />
          <p className="text-sm font-medium tracking-wide text-muted">SoundRain</p>
        </div>

        <ol className="mb-8 flex flex-col gap-3">
          {STEPS.map((step, i) => (
            <li key={step} className="flex gap-3 text-sm text-text/90">
              <span className="mt-px shrink-0 font-mono text-xs text-accent">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="relative">
            <input
              type={reveal ? "text" : "password"}
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="oauth_token"
              // biome-ignore lint/a11y/noAutofocus: единственное поле на экране, автофокус ускоряет вставку токена
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="w-full border border-hairline bg-surface px-3 py-2.5 pr-10 font-mono text-sm text-text placeholder:text-muted/60 outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              aria-label={reveal ? "Скрыть токен" : "Показать токен"}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-text"
            >
              {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <button
            type="submit"
            disabled={mutation.isPending || token.trim().length === 0}
            className="bg-accent py-2.5 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Войти
          </button>

          <div className="min-h-10 text-sm">
            {mutation.isPending && <p className="text-muted">Проверяем токен…</p>}
            {error?.kind === "invalidToken" && (
              <p className="text-danger">
                SoundCloud отклонил токен — получите новый по инструкции выше
              </p>
            )}
            {error?.kind === "network" && (
              <p className="text-danger">Нет связи с SoundCloud: {error.message}</p>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}

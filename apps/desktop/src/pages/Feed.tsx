import * as Tabs from "@radix-ui/react-tabs";
import { Settings as SettingsIcon } from "lucide-react";
import { useState } from "react";
import { FeedTab } from "../components/FeedTab";
import { LikesTab } from "../components/LikesTab";
import type { ScUser } from "../lib/api";
import { Search } from "./Search";
import { Settings } from "./Settings";

const TAB_TRIGGER_CLASS =
  "border-b-2 border-transparent py-3 text-sm text-muted transition-colors hover:text-text data-[state=active]:border-accent data-[state=active]:text-text";

interface FeedProps {
  user: ScUser;
  onLogout: () => void;
}

export function Feed({ user, onLogout }: FeedProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (settingsOpen) {
    return <Settings onBack={() => setSettingsOpen(false)} />;
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-bg text-text">
      <header className="flex items-center justify-end gap-4 border-b border-hairline px-6 py-4">
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Настройки"
          className="text-muted hover:text-text"
        >
          <SettingsIcon size={18} />
        </button>
        <div className="flex items-center gap-3">
          {user.avatarUrl && <img src={user.avatarUrl} alt="" className="h-7 w-7 object-cover" />}
          <div className="flex flex-col items-end">
            <span className="text-sm text-text">{user.username}</span>
            <button
              type="button"
              onClick={onLogout}
              className="text-xs text-muted underline hover:text-text"
            >
              Выйти
            </button>
          </div>
        </div>
      </header>

      <Tabs.Root defaultValue="stream" className="flex flex-1 flex-col overflow-hidden">
        <Tabs.List className="flex gap-6 border-b border-hairline px-6">
          <Tabs.Trigger value="stream" className={TAB_TRIGGER_CLASS}>
            Лента
          </Tabs.Trigger>
          <Tabs.Trigger value="likes" className={TAB_TRIGGER_CLASS}>
            Лайки
          </Tabs.Trigger>
          <Tabs.Trigger value="search" className={TAB_TRIGGER_CLASS}>
            Поиск
          </Tabs.Trigger>
        </Tabs.List>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <Tabs.Content value="stream">
            <FeedTab />
          </Tabs.Content>
          <Tabs.Content value="likes">
            <LikesTab user={user} />
          </Tabs.Content>
          <Tabs.Content value="search">
            <Search />
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  );
}

import { reactive, watch, type ComputedRef } from "vue";
import { notifyEvent } from "@/features/room/shell/roomNotify.js";
import { readStorage, writeStorage } from "@/shared/services/safeStorage.js";
import type { ChatMessage } from "@/features/session";

const MUTED_STORAGE_KEY = "webspeak.mutedChats";
// One toast per chat in this window, so a lively conversation does not stack them.
const COOLDOWN_MS = 4000;
const PREVIEW_CHARS = 100;

export interface UseChatToastsOptions {
  chatMessages: ChatMessage[];
  tabOfMessage: (message: ChatMessage) => string | null;
  /** What a mute is stored under. A channel tab is muted per channel, not for whichever channel you are in. */
  muteKeyOfTab: (tabKey: string) => string;
  tabTitle: (tabKey: string) => string;
  activeTabKey: ComputedRef<string>;
  chatOnScreen: ComputedRef<boolean>;
  openTab: (tabKey: string) => void;
  openLabel: () => string;
  /** Mutes are kept per server, channel ids repeat between servers. */
  serverKey: () => string;
}

type MutedByServer = Record<string, string[]>;

function loadAll(): MutedByServer {
  try {
    const parsed: unknown = JSON.parse(readStorage(MUTED_STORAGE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([server, keys]) => [server, Array.isArray(keys) ? keys.filter((key) => typeof key === "string") : []]),
    );
  } catch {
    return {};
  }
}

const preview = (text: string) => (text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS)}…` : text);

/** A toast for a message that lands in a chat the reader is not looking at, unless that chat is muted. */
export function useChatToasts(options: UseChatToastsOptions) {
  const muted = reactive(new Set<string>(loadAll()[options.serverKey()] ?? []));
  const lastToast = new Map<string, number>();

  const isMuted = (tabKey: string) => muted.has(options.muteKeyOfTab(tabKey));

  function toggleMute(tabKey: string): void {
    const key = options.muteKeyOfTab(tabKey);
    if (!muted.delete(key)) muted.add(key);
    writeStorage(MUTED_STORAGE_KEY, JSON.stringify({ ...loadAll(), [options.serverKey()]: [...muted] }));
  }

  function announce(message: ChatMessage): void {
    const tabKey = options.tabOfMessage(message);
    if (!tabKey || message.isSelf) return;
    if (tabKey === options.activeTabKey.value && options.chatOnScreen.value) return;
    const muteKey = options.muteKeyOfTab(tabKey);
    if (muted.has(muteKey)) return;
    const now = Date.now();
    if (now - (lastToast.get(muteKey) ?? 0) < COOLDOWN_MS) return;
    lastToast.set(muteKey, now);
    const text = preview(message.message);
    notifyEvent(options.tabTitle(tabKey), {
      variant: "info",
      reason: message.scope === "private" ? text : `${message.invokerName}: ${text}`,
      action: { label: options.openLabel(), onClick: () => options.openTab(tabKey) },
    });
  }

  watch(
    () => options.chatMessages.length,
    (length, previousLength) => {
      if (length > previousLength) options.chatMessages.slice(previousLength).forEach(announce);
    },
  );

  return { isMuted, toggleMute };
}

import { inject, provide, reactive, ref, type InjectionKey, type Ref } from "vue";
import type { LinkPreviewData } from "@/features/session";
import { readStorage, writeStorage } from "@/shared/services/safeStorage.js";

export type LinkPreviewState = { status: "loading" } | { status: "ready"; preview: LinkPreviewData } | { status: "error"; code: string };

type Request = (url: string, full?: boolean) => Promise<LinkPreviewData>;

const STORAGE_KEY = "webspeak:link-previews";
const CONCURRENCY = 2;
const RATE_LIMIT_CODE = "LINK_PREVIEW_RATE_LIMITED";
const RETRY_DELAYS_MS = [2000, 5000];

export interface LinkPreviews {
  /** The viewer's choice, on by default. Off means no address is sent to the gateway. */
  enabled: Ref<boolean>;
  setEnabled(value: boolean): void;
  /** The state of one address. Null while previews are off or before `ensure`. */
  stateOf(url: string): LinkPreviewState | null;
  /** Starts the request for an address unless it was asked for before. */
  ensure(url: string): void;
  /** The click on an image that came without its picture because it is large. */
  loadFull(url: string): void;
}

const errorCode = (error: unknown): string => (error as { code?: unknown } | null)?.code?.toString() ?? "LINK_PREVIEW_FAILED";

/**
 * Previews of the links in the chat, one request per address however often it is shown, a couple at a time so a long chat does not
 * trip the gateway's limit. Everything stays in memory: nothing about the links is written to the browser.
 */
export function createLinkPreviews(request: Request): LinkPreviews {
  const enabled = ref(readStorage(STORAGE_KEY) !== "off");
  const states = reactive(new Map<string, LinkPreviewState>());
  const queue: Array<() => Promise<void>> = [];
  let running = 0;

  const pump = () => {
    while (running < CONCURRENCY && queue.length > 0) {
      const job = queue.shift()!;
      running++;
      void job().finally(() => {
        running--;
        pump();
      });
    }
  };

  async function run(url: string, full: boolean): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        states.set(url, { status: "ready", preview: await request(url, full) });
        return;
      } catch (error) {
        const code = errorCode(error);
        const delay = RETRY_DELAYS_MS[attempt];
        if (code === RATE_LIMIT_CODE && delay !== undefined) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        states.set(url, { status: "error", code });
        return;
      }
    }
  }

  const enqueue = (url: string, full: boolean) => {
    queue.push(() => run(url, full));
    pump();
  };

  return {
    enabled,
    setEnabled(value) {
      enabled.value = value;
      writeStorage(STORAGE_KEY, value ? "on" : "off");
    },
    stateOf: (url) => (enabled.value ? (states.get(url) ?? null) : null),
    ensure(url) {
      if (!enabled.value || states.has(url)) return;
      states.set(url, { status: "loading" });
      enqueue(url, false);
    },
    loadFull(url) {
      states.set(url, { status: "loading" });
      enqueue(url, true);
    },
  };
}

const KEY: InjectionKey<LinkPreviews> = Symbol("linkPreviews");

export const provideLinkPreviews = (previews: LinkPreviews): void => provide(KEY, previews);

/** The previews of the room, or null outside one (a chat shown on its own gets plain links). */
export const useLinkPreviews = (): LinkPreviews | null => inject(KEY, null);

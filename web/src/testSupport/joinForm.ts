import { flushPromises, mount } from "@vue/test-utils";
import { IDBFactory } from "fake-indexeddb";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, reactive, ref } from "vue";
import { vi } from "vitest";
import type { VoiceState } from "@/features/session";

export const SERVERS = [
  { id: "server-a", name: "Home" },
  { id: "server-b", name: "Clan" },
];

/** Answers the public config with `config`, by default an initialized gateway with two servers. */
export function publicConfig(config: Record<string, unknown> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ initialized: true, servers: SERVERS, ...config }), { status: 200 })),
  );
}

export type Exposed = {
  nickname: string;
  channel: string;
  serverHost: string;
  serverPort: string;
  serverPassword: string;
  serverId: string;
  privacyNoticeUrl: string;
  servers: Array<{ id: string; name: string }>;
  accessMode: "fixed" | "open";
  rememberIdentity: boolean;
  favoriteServers: Array<{ id: string; label: string; address: string }>;
  recentServers: Array<{ id: string; address: string }>;
  initialized: boolean;
  browserError: string;
  serverConfigLoading: boolean;
  serverConfigFailed: boolean;
  loadPublicConfig: () => Promise<void>;
  serverPasswordDialog: { open: boolean; password: string; errorCode: string };
  canJoin: boolean;
  isFavorite: boolean;
  currentServerTarget: () => string;
  selectLocalServer: (address: string, savedNickname?: string) => void;
  toggleFavorite: () => Promise<void>;
  doConnect: () => void;
  doDisconnect: () => void;
  submitServerPassword: () => void;
  cancelServerPassword: () => void;
  clearBrowserData: () => Promise<void>;
};

export function makeVoiceState(): VoiceState {
  return reactive({
    connected: false,
    connecting: false,
    reconnecting: false,
    reconnectAttempt: 0,
    reconnectFailed: false,
    tsClientId: 0,
    error: "",
    errorCode: "",
    microphoneError: "",
    microphoneErrorCode: "",
    unattributedError: null,
    channelSwitchedChannelId: "",
  }) as VoiceState;
}

/** Mounts a bare component whose setup is `useJoinForm(options)`, so onMounted (loadPublicConfig,
 *  checkSupport, the favorites/recents load) runs through the real Vue lifecycle. */
export async function mountUseJoinForm(overrides: Partial<Parameters<typeof import("@/features/join/useJoinForm").useJoinForm>[0]> = {}) {
  const { useJoinForm } = await import("@/features/join/useJoinForm");
  const voiceState = makeVoiceState();
  const options = {
    voiceState,
    identityMaterial: ref(""),
    selectedIdentityId: ref<string | undefined>(undefined),
    connect: vi.fn(),
    disconnect: vi.fn(),
    clearError: vi.fn(),
    checkSupport: vi.fn(() => null),
    setThemeMode: vi.fn(),
    ...overrides,
  };
  const wrapper = mount(defineComponent({ setup: () => useJoinForm(options), template: "<div/>" }));
  await flushPromises();
  return { wrapper, vm: wrapper.vm as unknown as Exposed, options, voiceState };
}

/** A fresh pinia, storage and gateway stub for each test of the join form. */
export function resetJoinFormEnvironment() {
  setActivePinia(createPinia());
  // A fresh IDBFactory per test, not just per file, because afterEach's unstubAllGlobals() would drop the stub after the first
  // test and every later favorite/recent-server write would silently no-op against isLocalPersistenceAvailable() === false.
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } })),
  );
  vi.resetModules();
}

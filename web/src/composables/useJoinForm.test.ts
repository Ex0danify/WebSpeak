import { flushPromises, mount } from "@vue/test-utils";
import { IDBFactory } from "fake-indexeddb";
import { defineComponent, reactive, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VoiceState } from "./useVoiceWebSocket";

type Exposed = {
  nickname: string;
  channel: string;
  serverHost: string;
  serverPort: string;
  serverPassword: string;
  accessMode: "fixed" | "open";
  rememberIdentity: boolean;
  favoriteServers: Array<{ id: string; label: string; address: string }>;
  recentServers: Array<{ id: string; address: string }>;
  initialized: boolean;
  browserError: string;
  serverConfigLoading: boolean;
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
  doShare: () => void;
  clearBrowserData: () => Promise<void>;
  recordServerVisit: () => void;
};

function makeVoiceState(): VoiceState {
  return reactive({
    connected: false, connecting: false, reconnecting: false, reconnectAttempt: 0, reconnectFailed: false,
    tsClientId: 0, error: "", errorCode: "", microphoneError: "", microphoneErrorCode: "", audioNotice: "",
    audioNoticeCode: "", channelSwitchedChannelId: "",
  }) as VoiceState;
}

/** Mounts a bare component whose setup is `useJoinForm(options)`, so onMounted (loadPublicConfig,
 *  checkSupport, the favorites/recents load) runs through the real Vue lifecycle. */
async function mountUseJoinForm(overrides: Partial<Parameters<typeof import("./useJoinForm").useJoinForm>[0]> = {}) {
  const { useJoinForm } = await import("./useJoinForm");
  const voiceState = makeVoiceState();
  const options = {
    voiceState,
    identityMaterial: ref(""),
    selectedChannelId: ref("channel-1"),
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

beforeEach(() => {
  // A fresh IDBFactory per test, not just per file: `afterEach`'s `unstubAllGlobals()` would
  // otherwise drop the stub after the first test, and every later favorite/recent-server write
  // would silently no-op against `isLocalPersistenceAvailable() === false`.
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } })));
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("canJoin", () => {
  it("is false until initialized, even with a nickname", async () => {
    const { vm } = await mountUseJoinForm();
    vm.nickname = "Lucas";
    await flushPromises();
    expect(vm.canJoin).toBe(false);
  });

  it("is true once initialized with a nickname in fixed mode", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ initialized: true }), { status: 200 })));
    const { vm } = await mountUseJoinForm();
    vm.nickname = "Lucas";
    await flushPromises();
    expect(vm.canJoin).toBe(true);
  });

  it("requires a valid port in open mode", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ initialized: true, accessMode: "open" }), { status: 200 })));
    const { vm } = await mountUseJoinForm();
    vm.nickname = "Lucas";
    vm.serverHost = "example.com";
    vm.serverPort = "not-a-port";
    await flushPromises();
    expect(vm.canJoin).toBe(false);
    vm.serverPort = "9987";
    await flushPromises();
    expect(vm.canJoin).toBe(true);
  });
});

describe("doConnect", () => {
  it("does nothing when canJoin is false", async () => {
    const { vm, options } = await mountUseJoinForm();
    vm.doConnect();
    expect(options.connect).not.toHaveBeenCalled();
  });

  it("trims fields, resets the channel selection and calls connect with the target", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ initialized: true }), { status: 200 })));
    const { vm, options } = await mountUseJoinForm();
    vm.nickname = "  Lucas  ";
    vm.channel = " lobby ";
    await flushPromises();
    vm.doConnect();
    expect(options.clearError).toHaveBeenCalled();
    expect(options.selectedChannelId.value).toBe("");
    expect(vm.nickname).toBe("Lucas");
    expect(options.connect).toHaveBeenCalledWith(vm.currentServerTarget(), "lobby", "Lucas", "", "", true, "", false, "");
  });

  it("does nothing while already connecting", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ initialized: true }), { status: 200 })));
    const { vm, options, voiceState } = await mountUseJoinForm();
    vm.nickname = "Lucas";
    voiceState.connecting = true;
    await flushPromises();
    vm.doConnect();
    expect(options.connect).not.toHaveBeenCalled();
  });
});

describe("doDisconnect", () => {
  it("disconnects and resets the selected channel", async () => {
    const { vm, options } = await mountUseJoinForm();
    vm.doDisconnect();
    expect(options.disconnect).toHaveBeenCalled();
    expect(options.selectedChannelId.value).toBe("");
  });
});

describe("server password dialog", () => {
  it("submitting sets the password and reconnects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ initialized: true }), { status: 200 })));
    const { vm, options } = await mountUseJoinForm();
    vm.nickname = "Lucas";
    vm.serverPasswordDialog.open = true;
    vm.serverPasswordDialog.password = "secret";
    await flushPromises();
    vm.submitServerPassword();
    expect(vm.serverPassword).toBe("secret");
    expect(vm.serverPasswordDialog.open).toBe(false);
    expect(options.connect).toHaveBeenCalled();
  });

  it("does nothing when there is no password to submit", async () => {
    const { vm, options } = await mountUseJoinForm();
    vm.serverPasswordDialog.open = true;
    await flushPromises();
    vm.submitServerPassword();
    expect(options.connect).not.toHaveBeenCalled();
  });

  it("cancelling clears the dialog and the gateway error", async () => {
    const { vm, options } = await mountUseJoinForm();
    vm.serverPasswordDialog.open = true;
    vm.serverPasswordDialog.password = "secret";
    await flushPromises();
    vm.cancelServerPassword();
    expect(vm.serverPasswordDialog.open).toBe(false);
    expect(vm.serverPasswordDialog.password).toBe("");
    expect(options.clearError).toHaveBeenCalled();
  });
});

describe("selectLocalServer", () => {
  it("fills the target, and the nickname only when empty", async () => {
    const { vm } = await mountUseJoinForm();
    vm.selectLocalServer("voice.example.com:9987", "Saved Nick");
    await flushPromises();
    expect(vm.serverHost).toBe("voice.example.com");
    expect(vm.serverPort).toBe("9987");
    expect(vm.nickname).toBe("Saved Nick");

    vm.selectLocalServer("other.example.com:9988", "Other Nick");
    await flushPromises();
    expect(vm.nickname).toBe("Saved Nick");
  });
});

describe("favorites", () => {
  it("saves then removes the current target", async () => {
    const { vm } = await mountUseJoinForm();
    vm.accessMode = "open";
    vm.serverHost = "voice.example.com";
    vm.serverPort = "9987";
    await flushPromises();
    expect(vm.isFavorite).toBe(false);

    await vm.toggleFavorite();
    await flushPromises();
    expect(vm.isFavorite).toBe(true);
    expect(vm.favoriteServers).toHaveLength(1);

    await vm.toggleFavorite();
    await flushPromises();
    expect(vm.isFavorite).toBe(false);
    expect(vm.favoriteServers).toHaveLength(0);
  });
});

describe("clearBrowserData", () => {
  it("resets identity, remembered flag, favorites and theme after confirming", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const { vm, options } = await mountUseJoinForm();
    options.identityMaterial.value = "material";
    vm.rememberIdentity = true;
    await flushPromises();

    await vm.clearBrowserData();

    expect(options.identityMaterial.value).toBe("");
    expect(vm.rememberIdentity).toBe(false);
    expect(vm.favoriteServers).toEqual([]);
    expect(vm.recentServers).toEqual([]);
    expect(options.setThemeMode).toHaveBeenCalledWith("system");
  });

  it("does nothing without confirmation", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    const { vm, options } = await mountUseJoinForm();
    options.identityMaterial.value = "material";
    await flushPromises();

    await vm.clearBrowserData();

    expect(options.identityMaterial.value).toBe("material");
    expect(options.setThemeMode).not.toHaveBeenCalled();
  });
});

describe("loadPublicConfig (run on mount)", () => {
  it("applies the gateway's public config", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      initialized: true,
      siteName: "Raid Night",
      version: "1.2.3",
      visitorNumber: 42,
      visitorTotal: 100,
      accessMode: "open",
      accelerationRelays: [{ id: "r1", name: "Tokyo" }],
    }), { status: 200 })));
    const { vm } = await mountUseJoinForm();
    expect(vm.initialized).toBe(true);
    expect(vm.serverConfigLoading).toBe(false);
    expect(vm.browserError).toBe("");
  });

  it("surfaces checkSupport's message as browserError", async () => {
    const { vm } = await mountUseJoinForm({ checkSupport: vi.fn(() => "no webcodecs") });
    expect(vm.browserError).toBe("no webcodecs");
  });
});

describe("recordServerVisit", () => {
  it("does nothing without a target", async () => {
    const { vm } = await mountUseJoinForm();
    vm.serverHost = "";
    await flushPromises();
    expect(() => vm.recordServerVisit()).not.toThrow();
    expect(vm.recentServers).toEqual([]);
  });

  it("records the current target as a recent server", async () => {
    const { vm } = await mountUseJoinForm();
    vm.accessMode = "open";
    vm.serverHost = "voice.example.com";
    vm.serverPort = "9987";
    await flushPromises();
    vm.recordServerVisit();
    await vi.waitFor(() => expect(vm.recentServers).toHaveLength(1));
    expect(vm.recentServers[0].address).toContain("voice.example.com");
  });
});

describe("doShare", () => {
  it("copies an invite link built from the current target and channel", async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { vm } = await mountUseJoinForm();
    vm.accessMode = "open";
    vm.serverHost = "voice.example.com";
    vm.serverPort = "9987";
    vm.channel = "lobby";
    await flushPromises();
    vm.doShare();
    await flushPromises();
    expect(writeText).toHaveBeenCalled();
    const invite = writeText.mock.calls[0][0] as string;
    expect(invite).toContain("channel=lobby");
  });
});

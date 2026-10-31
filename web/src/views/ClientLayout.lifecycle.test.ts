import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Persistence from "@/shared/services/localPersistence";
import { installBrowserStubs, type BrowserStubs } from "@/testSupport/browserStubs";
import { mountClient } from "@/testSupport/mountClient";
import { FakeWebSocket } from "@/testSupport/fakeWebsocket";

// Pins the lifecycle behaviors ClientLayout owns (sounds on connection changes, the server visit, the server-password dialog,
// disconnect on unmount, the performance monitor, pokes, private chat sound) on the real component against the fake gateway.
// A behavior that looks wrong is recorded as it is, with a comment, not fixed here.

const showToast = vi.fn();
const playedCues: string[] = [];

vi.mock("@/features/voice", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/voice")>();
  return {
    ...actual,
    useAudioOutput: (...args: Parameters<typeof actual.useAudioOutput>) => {
      const output = actual.useAudioOutput(...args);
      return {
        ...output,
        playNotification: (kind: Parameters<typeof output.playNotification>[0]) => {
          playedCues.push(kind);
          output.playNotification(kind);
        },
      };
    },
  };
});

vi.mock("@/shared/composables/useToast", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/composables/useToast")>();
  return {
    ...actual,
    showToast: (...args: unknown[]) => {
      showToast(...args);
    },
  };
});

type View = {
  identityReady: boolean;
  serverHost: string;
  serverPasswordDialog: { open: boolean; password: string; errorCode: string };
  voiceState: { errorCode: string; connected: boolean };
  connect: (host: string, channel: string, nickname: string) => void;
};

let RoomWorkspace: typeof import("@/features/room").RoomWorkspace;
let store: typeof Persistence;
let wrapper: VueWrapper | undefined;
let stubs: BrowserStubs | undefined;

beforeAll(async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("AudioWorkletNode", class {}); // the noise suppressor library extends it when it loads
  store = await import("@/shared/services/localPersistence");
  RoomWorkspace = (await import("@/features/room")).RoomWorkspace;
}, 30_000);

beforeEach(async () => {
  playedCues.length = 0;
  localStorage.clear();
  await store.clearLocalData();
  showToast.mockClear();
  stubs = installBrowserStubs();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  stubs?.restore();
  vi.useRealTimers();
});

/** The connected shell lives in RoomWorkspace, so its setup state is reached there. */
function roomWorkspace() {
  return wrapper!.findComponent(RoomWorkspace).vm as unknown as { togglePerformancePanel: () => void; performanceRunning: boolean };
}

async function mountView(): Promise<View> {
  const mounted = await mountClient();
  wrapper = mounted.wrapper;
  const view = mounted.page as unknown as View;
  await vi.waitFor(() => expect(view.identityReady).toBe(true));
  await flushPromises();
  return view;
}

async function joinSocket(view: View): Promise<FakeWebSocket> {
  view.connect("ts.example.test", "Lobby", "Tester");
  await flushPromises();
  const socket = FakeWebSocket.last;
  socket.open();
  return socket;
}

async function connected(view: View): Promise<FakeWebSocket> {
  const socket = await joinSocket(view);
  socket.receive({ type: "connected", tsClientId: 7, members: [] });
  await flushPromises();
  return socket;
}

/** The cues played so far, by name, in order. The harness has no WebRTC, so a voice-failed banner sounds an error cue in every test. */
function tones(): string[] {
  return playedCues.filter((cue) => cue !== "error");
}

describe("connection sounds", () => {
  it("plays the connected tone when the gateway reports connected, and none before", async () => {
    const view = await mountView();
    const socket = await joinSocket(view);
    expect(tones()).toEqual([]);
    socket.receive({ type: "connected", tsClientId: 7, members: [] });
    await flushPromises();
    expect(tones()).toEqual(["connected"]);
  });

  it("plays the disconnected tone once when reconnecting starts, not again for further attempts", async () => {
    const view = await mountView();
    const socket = await connected(view);
    socket.receive({ type: "reconnecting", attempt: 1 });
    await flushPromises();
    socket.receive({ type: "reconnecting", attempt: 2 });
    await flushPromises();
    expect(tones()).toEqual(["connected", "disconnected"]);
  });

  it("plays the connected tone again after a successful reconnect", async () => {
    const view = await mountView();
    const socket = await connected(view);
    socket.receive({ type: "reconnecting", attempt: 1 });
    await flushPromises();
    socket.receive({ type: "connected", tsClientId: 7, members: [] });
    await flushPromises();
    expect(tones()).toEqual(["connected", "disconnected", "connected"]);
  });

  it("plays the reconnect-failed tone when reconnecting gives up", async () => {
    const view = await mountView();
    const socket = await connected(view);
    socket.receive({ type: "reconnecting", attempt: 1 });
    await flushPromises();
    socket.receive({ type: "reconnectFailed", code: "CONNECTION_FAILED" });
    await flushPromises();
    expect(tones()).toEqual(["connected", "disconnected", "reconnectFailed"]);
  });
});

describe("server visit", () => {
  // The visit is an upsert keyed by target, so "recorded" is read from the store: lastConnectedAt
  // carries the (faked) time of the connected flip that wrote it.
  const recentAddresses = async () =>
    (await store.listRecentServers()).map((server) => ({ address: server.address, at: server.lastConnectedAt }));
  const waitForRecent = (expected: { address: string; at: number }[]) =>
    vi.waitFor(async () => expect(await recentAddresses()).toEqual(expected));

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_000 });
  });

  it("is recorded when connected, with the target, and not before", async () => {
    const view = await mountView();
    view.serverHost = "ts.example.test";
    const socket = await joinSocket(view);
    await flushPromises();
    expect(await recentAddresses()).toEqual([]);
    vi.setSystemTime(2_000);
    socket.receive({ type: "connected", tsClientId: 7, members: [] });
    await flushPromises();
    await waitForRecent([{ address: "ts.example.test:9987", at: 2_000 }]);
  });

  // The visit is recorded on every connected flip, including the one after a reconnect (an upsert of the same id, so only
  // lastConnectedAt moves).
  it("is recorded again after a reconnect", async () => {
    const view = await mountView();
    view.serverHost = "ts.example.test";
    vi.setSystemTime(2_000);
    const socket = await connected(view);
    await waitForRecent([{ address: "ts.example.test:9987", at: 2_000 }]);
    socket.receive({ type: "reconnecting", attempt: 1 });
    await flushPromises();
    vi.setSystemTime(3_000);
    socket.receive({ type: "connected", tsClientId: 7, members: [] });
    await flushPromises();
    await waitForRecent([{ address: "ts.example.test:9987", at: 3_000 }]);
  });

  it("is not recorded when there is no server target", async () => {
    const view = await mountView();
    view.serverHost = "";
    await connected(view);
    await flushPromises();
    expect(await recentAddresses()).toEqual([]);
  });
});

describe("server password dialog", () => {
  it.each(["SERVER_PASSWORD_REQUIRED", "INVALID_SERVER_PASSWORD"])("opens on %s and clears the session error", async (code) => {
    const view = await mountView();
    const socket = await joinSocket(view);
    socket.receive({ type: "connectionFailed", code });
    await flushPromises();
    expect(view.serverPasswordDialog).toMatchObject({ open: true, password: "", errorCode: code });
    expect(view.voiceState.errorCode).toBe("");
  });

  it("stays closed for any other error code", async () => {
    const view = await mountView();
    const socket = await joinSocket(view);
    socket.receive({ type: "connectionFailed", code: "CONNECTION_FAILED" });
    await flushPromises();
    expect(view.serverPasswordDialog.open).toBe(false);
    expect(view.voiceState.errorCode).toBe("CONNECTION_FAILED");
  });
});

describe("unmount", () => {
  it("disconnects the session: the socket is closed", async () => {
    const view = await mountView();
    const socket = await connected(view);
    expect(socket.closedWith).toBeNull();
    wrapper?.unmount();
    wrapper = undefined;
    expect(socket.closedWith).not.toBeNull();
  });
});

describe("performance monitor", () => {
  it("probes while connected with the panel open, stops when the connection drops, and restarts on reconnect", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const view = await mountView();
    const socket = await connected(view);
    roomWorkspace().togglePerformancePanel();
    await flushPromises();
    expect(socket.sentOfType("latencyProbe")).toHaveLength(1);

    socket.receive({ type: "reconnecting", attempt: 1 });
    await flushPromises();
    expect(roomWorkspace().performanceRunning).toBe(false);
    vi.advanceTimersByTime(10_000);
    await flushPromises();
    expect(socket.sentOfType("latencyProbe")).toHaveLength(1);

    socket.receive({ type: "connected", tsClientId: 7, members: [] });
    await flushPromises();
    expect(socket.sentOfType("latencyProbe")).toHaveLength(2);
  });

  it("does not probe on connect while the panel is closed", async () => {
    const view = await mountView();
    const socket = await connected(view);
    expect(socket.sentOfType("latencyProbe")).toHaveLength(0);
  });
});

describe("pokes", () => {
  class FakeNotification {
    static permission = "granted";
    static created: { title: string; options?: NotificationOptions }[] = [];
    constructor(title: string, options?: NotificationOptions) {
      FakeNotification.created.push({ title, options });
    }
  }

  beforeEach(() => {
    FakeNotification.created = [];
    FakeNotification.permission = "granted";
    vi.stubGlobal("Notification", FakeNotification);
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).Notification;
  });

  it("shows a toast, plays the poke tone and raises a desktop notification", async () => {
    const view = await mountView();
    const socket = await connected(view);
    socket.receive({ type: "pokeReceived", invokerId: 9, invokerName: "Alice", message: "wake up" });
    await flushPromises();
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(String(showToast.mock.calls[0]?.[0])).toContain("Alice");
    expect(String(showToast.mock.calls[0]?.[0])).toContain("wake up");
    expect(tones()).toEqual(["connected", "poke"]);
    expect(FakeNotification.created).toHaveLength(1);
    expect(FakeNotification.created[0]?.options?.body).toContain("Alice: wake up");
  });

  it("skips the desktop notification when permission is not granted", async () => {
    FakeNotification.permission = "denied";
    const view = await mountView();
    const socket = await connected(view);
    socket.receive({ type: "pokeReceived", invokerId: 9, invokerName: "Alice", message: "" });
    await flushPromises();
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(tones()).toEqual(["connected", "poke"]);
    expect(FakeNotification.created).toHaveLength(0);
  });
});

describe("chat sounds", () => {
  it("plays the private tone for a private message from someone else", async () => {
    const view = await mountView();
    const socket = await connected(view);
    socket.receive({ type: "chatMessage", scope: "private", invokerId: 9, invokerName: "Alice", message: "psst" });
    await flushPromises();
    expect(tones()).toEqual(["connected", "private"]);
  });

  it("plays nothing for channel and server messages", async () => {
    const view = await mountView();
    const socket = await connected(view);
    socket.receive({ type: "chatMessage", scope: "channel", invokerId: 9, invokerName: "Alice", message: "hi" });
    socket.receive({ type: "chatMessage", scope: "server", invokerId: 9, invokerName: "Alice", message: "hi" });
    await flushPromises();
    expect(tones()).toEqual(["connected"]);
  });

  it("plays nothing for the user's own private message", async () => {
    const view = await mountView();
    const socket = await connected(view);
    socket.receive({ type: "chatMessage", scope: "private", invokerId: 7, invokerName: "Tester", message: "me" });
    await flushPromises();
    expect(tones()).toEqual(["connected"]);
  });
});

// Test-only harness: installs the browser stubs, loads the composable fresh, and drives a
// connect/join round trip against `FakeWebSocket`. Import it from voice tests only.
import { flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { installBrowserStubs, type BrowserStubOptions, type BrowserStubs } from "./browserStubs";
import { FakeWebSocket } from "./fakeWebsocket";

export interface VoiceHarness {
  /** The object `useRoomSession()` returned. */
  voice: ReturnType<typeof import("@/features/room/useRoomSession").useRoomSession>;
  stubs: BrowserStubs;
  /** The most recent socket the composable opened. */
  socket: () => FakeWebSocket;
  /** connect() -> ticket -> socket open, resolved. */
  join: (overrides?: { channel?: string; nickname?: string }) => Promise<FakeWebSocket>;
  /** join(), then the gateway's `connected` message. */
  joinAndConnect: (message?: Record<string, unknown>) => Promise<FakeWebSocket>;
  dispose: () => void;
}

export async function createVoiceHarness(options: BrowserStubOptions = {}): Promise<VoiceHarness> {
  const stubs = installBrowserStubs(options);
  setActivePinia(createPinia());
  const { useRoomSession } = await import("@/features/room/useRoomSession");
  const voice = useRoomSession();

  const join: VoiceHarness["join"] = async (overrides = {}) => {
    voice.session.connect("ts.example.test", overrides.channel ?? "Lobby", overrides.nickname ?? "Tester");
    await flushPromises();
    const socket = FakeWebSocket.last;
    socket.open();
    return socket;
  };

  return {
    voice,
    stubs,
    socket: () => FakeWebSocket.last,
    join,
    joinAndConnect: async (message = {}) => {
      const socket = await join();
      socket.receive({ type: "connected", tsClientId: 7, members: [], ...message });
      await flushPromises();
      return socket;
    },
    dispose: () => {
      voice.session.disconnect();
      stubs.restore();
    },
  };
}

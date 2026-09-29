// Test-only harness: installs the browser stubs, loads the composable fresh, and drives a
// connect/join round trip against `FakeWebSocket`. Import it from voice tests only.
import { flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { installBrowserStubs, type BrowserStubOptions, type BrowserStubs } from "./browser-stubs";
import { FakeWebSocket } from "./fake-websocket";

export interface VoiceHarness {
  /** The object `useVoiceWebSocket()` returned. */
  voice: ReturnType<typeof import("../../useVoiceWebSocket").useVoiceWebSocket>;
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
  const { useVoiceWebSocket } = await import("../../useVoiceWebSocket");
  const voice = useVoiceWebSocket();

  const join: VoiceHarness["join"] = async (overrides = {}) => {
    voice.connect("ts.example.test", overrides.channel ?? "Lobby", overrides.nickname ?? "Tester");
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
      voice.disconnect();
      stubs.restore();
    },
  };
}

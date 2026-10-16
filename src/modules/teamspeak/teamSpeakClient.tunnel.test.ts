import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "../../shared/logger.js";

type Listener = (...args: unknown[]) => void;
const adapters: FakeAdapter[] = [];
const tunnels: FakeTunnel[] = [];

class FakeAdapter {
  readonly listeners = new Map<string, Listener>();
  readonly client = Object.assign(new (class {})(), {
    on: (event: string, listener: Listener) => {
      this.listeners.set(event, listener);
    },
    clientID: () => 56,
    channelID: () => 1n,
    execCommand: async () => undefined,
    execCommandWithResponse: async () => [],
  });
  readonly disconnect = vi.fn(async () => undefined);
  readonly connect = vi.fn(async () => undefined);

  constructor(readonly config: { target: { host: string; port: number } }) {
    adapters.push(this);
  }
}

class FakeTunnel {
  closed = false;
  readonly close = vi.fn(() => {
    this.closed = true;
  });
  readonly localHost = "127.0.0.1";
  readonly sessionId = 1;
  constructor(readonly localPort: number) {
    tunnels.push(this);
  }
  isClosed = () => this.closed;
}

vi.mock("./teamSpeakAdapter.js", () => ({ TeamSpeakAdapter: FakeAdapter }));
vi.mock("../relay/index.js", () => ({
  createAccelerationRelayClient: vi.fn(async () => new FakeTunnel(40_000 + tunnels.length)),
}));

const { TSClient } = await import("./teamSpeakClient.js");

const logger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return logger;
  },
};

const options = {
  target: { host: "ts.example", port: 9987 },
  nickname: "tunnel-user",
  acceleration: { relayHost: "relay.example", relayPort: 39087, token: "relay-token-0123456789" },
};

describe("an accelerated TeamSpeak client reconnecting", () => {
  beforeEach(() => {
    adapters.length = 0;
    tunnels.length = 0;
  });

  it("keeps the live tunnel and adapter across a reconnect", async () => {
    const client = new TSClient(options, logger);
    await client.connect();
    await client.connect();
    expect(adapters).toHaveLength(1);
    expect(tunnels).toHaveLength(1);
  });

  it("rebuilds both when the tunnel closed itself, so the retry does not dial a dead local port", async () => {
    const client = new TSClient(options, logger);
    await client.connect();
    tunnels[0]!.closed = true;

    await client.connect();

    expect(adapters).toHaveLength(2);
    expect(tunnels).toHaveLength(2);
    expect(adapters[0]!.disconnect).toHaveBeenCalledTimes(1);
    expect(adapters[1]!.config.target.port).toBe(tunnels[1]!.localPort);
    expect(adapters[1]!.config.target.port).not.toBe(tunnels[0]!.localPort);
  });

  it("ignores a late disconnect from the retired client", async () => {
    const client = new TSClient(options, logger);
    const disconnected = vi.fn();
    client.on("disconnected", disconnected);
    await client.connect();
    tunnels[0]!.closed = true;
    await client.connect();

    adapters[0]!.listeners.get("disconnected")!(undefined);
    expect(disconnected).not.toHaveBeenCalled();

    adapters[1]!.listeners.get("disconnected")!(undefined);
    expect(disconnected).toHaveBeenCalledTimes(1);
  });
});

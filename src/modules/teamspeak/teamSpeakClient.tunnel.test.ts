import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBackends, silentLogger, type FakeBackend } from "../../../test/support/fakeTsBackend.js";

const tunnels: FakeTunnel[] = [];

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

vi.mock("../relay/index.js", () => ({
  createAccelerationRelayClient: vi.fn(async () => new FakeTunnel(40_000 + tunnels.length)),
}));

const { TSClient } = await import("./teamSpeakClient.js");

const options = {
  target: { host: "ts.example", port: 9987 },
  nickname: "tunnel-user",
  acceleration: { relayHost: "relay.example", relayPort: 39087, token: "relay-token-0123456789" },
};

describe("an accelerated TeamSpeak client reconnecting", () => {
  let backends: FakeBackend[];
  let client: InstanceType<typeof TSClient>;
  beforeEach(() => {
    tunnels.length = 0;
    const fakes = fakeBackends();
    backends = fakes.backends;
    client = new TSClient(options, silentLogger, fakes.factory);
  });

  it("keeps the live tunnel and backend across a reconnect", async () => {
    await client.connect();
    await client.connect();
    expect(backends).toHaveLength(1);
    expect(tunnels).toHaveLength(1);
  });

  it("rebuilds both when the tunnel closed itself, so the retry does not dial a dead local port", async () => {
    await client.connect();
    tunnels[0]!.closed = true;

    await client.connect();

    expect(backends).toHaveLength(2);
    expect(tunnels).toHaveLength(2);
    expect(backends[0]!.disconnects).toBe(1);
    expect(backends[1]!.options.transportTarget.port).toBe(tunnels[1]!.localPort);
    expect(backends[1]!.options.transportTarget.port).not.toBe(tunnels[0]!.localPort);
  });

  it("ignores a late disconnect from the retired backend", async () => {
    const disconnected = vi.fn();
    client.on("disconnected", disconnected);
    await client.connect();
    tunnels[0]!.closed = true;
    await client.connect();

    backends[0]!.emit("disconnected", undefined);
    expect(disconnected).not.toHaveBeenCalled();

    backends[1]!.emit("disconnected", undefined);
    expect(disconnected).toHaveBeenCalledTimes(1);
  });
});

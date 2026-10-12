import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "../../shared/logger.js";

const adapters: FakeAdapter[] = [];

class FakeAdapter {
  readonly client = Object.assign(new (class {})(), {
    on() {},
    clientID: () => 56,
    channelID: () => 1n,
    execCommand: async () => undefined,
    execCommandWithResponse: async () => [],
  });
  release: () => void = () => undefined;
  readonly disconnect = vi.fn(async () => undefined);
  readonly connect = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        this.release = resolve;
      }),
  );

  constructor() {
    adapters.push(this);
  }
}

vi.mock("./teamSpeakAdapter.js", () => ({ TeamSpeakAdapter: FakeAdapter }));

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

describe("a TeamSpeak connect that is cancelled while it is in flight", () => {
  beforeEach(() => {
    adapters.length = 0;
  });

  it("closes the session the SDK finishes afterwards and never reports it as connected", async () => {
    const client = new TSClient({ target: { host: "127.0.0.1", port: 9987 }, nickname: "early-leaver" }, logger);
    const connected = vi.fn();
    client.on("connected", connected);

    const connecting = client.connect();
    await client.disconnect();
    expect(adapters).toHaveLength(1);
    expect(adapters[0]!.disconnect).toHaveBeenCalledTimes(1);

    // The address lookup inside the SDK ends only now, and the handshake completes on its own.
    adapters[0]!.release();
    await connecting;

    expect(adapters[0]!.disconnect).toHaveBeenCalledTimes(2);
    expect(connected).not.toHaveBeenCalled();
    expect(client.getClientId()).toBe(0);
  });

  it("still connects when nobody disconnected", async () => {
    const client = new TSClient({ target: { host: "127.0.0.1", port: 9987 }, nickname: "stays" }, logger);
    const connecting = client.connect();
    adapters[0]!.release();
    await connecting;
    expect(adapters[0]!.disconnect).not.toHaveBeenCalled();
    expect(client.getClientId()).toBe(56);
  });
});

import { describe, expect, it } from "vitest";
import { fakeBackends, silentLogger } from "../../../test/support/fakeTsBackend.js";
import { TSClient } from "./teamSpeakClient.js";

function holdConnect() {
  const { backends, factory } = fakeBackends();
  let release: () => void = () => undefined;
  const make: typeof factory = (options, logger) => {
    const backend = factory(options, logger);
    backend.onConnect = () => new Promise<void>((resolve) => (release = resolve));
    return backend;
  };
  return { backends, factory: make, release: () => release() };
}

describe("a TeamSpeak connect that is cancelled while it is in flight", () => {
  it("closes the session that finishes afterwards and never reports it as connected", async () => {
    const { backends, factory, release } = holdConnect();
    const client = new TSClient({ target: { host: "127.0.0.1", port: 9987 }, nickname: "early-leaver" }, silentLogger, factory);
    let connected = false;
    client.on("connected", () => (connected = true));

    const connecting = client.connect();
    await Promise.resolve();
    await client.disconnect();
    expect(backends).toHaveLength(1);
    expect(backends[0]!.disconnects).toBe(1);

    // The handshake completes on its own after the disconnect.
    release();
    await connecting;

    expect(backends[0]!.disconnects).toBe(2);
    expect(connected).toBe(false);
    expect(client.getClientId()).toBe(0);
  });

  it("swallows the failure of a connect that disconnect() stopped", async () => {
    const { backends, factory } = fakeBackends();
    const client = new TSClient({ target: { host: "127.0.0.1", port: 9987 }, nickname: "stopped" }, silentLogger, (options, logger) => {
      const backend = factory(options, logger);
      backend.onConnect = () => new Promise<void>((_resolve, reject) => setImmediate(() => reject(new Error("closed while connecting"))));
      return backend;
    });
    const connecting = client.connect();
    await Promise.resolve();
    await client.disconnect();
    await expect(connecting).resolves.toBeUndefined();
    expect(backends[0]!.disconnects).toBe(1);
  });

  it("still connects when nobody disconnected", async () => {
    const { backends, factory, release } = holdConnect();
    const client = new TSClient({ target: { host: "127.0.0.1", port: 9987 }, nickname: "stays" }, silentLogger, factory);
    const connecting = client.connect();
    await Promise.resolve();
    release();
    await connecting;
    expect(backends[0]!.disconnects).toBe(0);
    expect(client.getClientId()).toBe(56);
  });
});

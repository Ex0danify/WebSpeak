import { createSocket, type Socket } from "node:dgram";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createUdpImpairmentProxy, type UdpImpairmentProxy } from "./udpImpairmentProxy.js";

const sockets: Socket[] = [];
const proxies: UdpImpairmentProxy[] = [];

afterEach(async () => {
  await Promise.all(proxies.splice(0).map((proxy) => proxy.close()));
  await Promise.all(sockets.splice(0).map((socket) => new Promise<void>((resolve) => socket.close(() => resolve()))));
});

/** A UDP echo server for the proxy to relay to. */
async function echoServer(): Promise<{ host: string; port: number }> {
  const socket = createSocket("udp4");
  sockets.push(socket);
  socket.on("message", (data, rinfo) => socket.send(data, rinfo.port, rinfo.address));
  await new Promise<void>((resolve) => socket.bind(0, "127.0.0.1", resolve));
  return { host: "127.0.0.1", port: socket.address().port };
}

/** Sends `text` through the proxy and resolves with the echo, or undefined after `waitMs`. */
async function roundTrip(proxy: UdpImpairmentProxy, text: string, waitMs = 2_000): Promise<string | undefined> {
  const client = createSocket("udp4");
  sockets.push(client);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), waitMs);
    client.on("message", (data) => {
      clearTimeout(timer);
      resolve(data.toString());
    });
    client.send(text, proxy.port, proxy.host);
  });
}

describe("createUdpImpairmentProxy", () => {
  it("relays a datagram to the target and the reply back", async () => {
    const target = await echoServer();
    const proxy = await createUdpImpairmentProxy({ target });
    proxies.push(proxy);
    expect(await roundTrip(proxy, "hello")).toBe("hello");
    expect(proxy.stats.sent).toBeGreaterThanOrEqual(2); // there and back
    expect(proxy.stats.dropped).toBe(0);
  });

  it("drops everything at drop=1 and counts it", async () => {
    const target = await echoServer();
    const proxy = await createUdpImpairmentProxy({ target, impairment: { drop: 1 } });
    proxies.push(proxy);
    expect(await roundTrip(proxy, "hello", 200)).toBeUndefined();
    await vi.waitFor(() => expect(proxy.stats.dropped).toBeGreaterThan(0));
  });

  it("still delivers under partial loss", async () => {
    const target = await echoServer();
    const proxy = await createUdpImpairmentProxy({ target, impairment: { drop: 0.3, duplicate: 0.2, reorder: 0.5 }, seed: 7 });
    proxies.push(proxy);
    let delivered = false;
    for (let i = 0; i < 12 && !delivered; i++) delivered = (await roundTrip(proxy, `n${i}`, 1_000)) !== undefined;
    expect(delivered).toBe(true);
  });
});

import { createSocket, type Socket } from "node:dgram";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { TeamSpeakTransportError } from "../errors/teamSpeakErrors.js";
import { openUdpChannel } from "./udpChannel.js";

const servers: Socket[] = [];

async function udpServer(type: "udp4" | "udp6", host: string): Promise<{ socket: Socket; port: number }> {
  const socket = createSocket(type);
  servers.push(socket);
  socket.bind(0, host);
  await once(socket, "listening");
  return { socket, port: socket.address().port };
}

afterEach(() => {
  for (const socket of servers.splice(0)) socket.close();
});

describe("openUdpChannel", () => {
  it("sends to and receives from the connected peer", async () => {
    const server = await udpServer("udp4", "127.0.0.1");
    const channel = await openUdpChannel({ host: "127.0.0.1", port: server.port });
    const received: Buffer[] = [];
    channel.attach({ message: (datagram) => received.push(datagram), error: () => undefined });

    channel.send(Buffer.from("ping"));
    const [request, from] = (await once(server.socket, "message")) as [Buffer, { port: number }];
    expect(request.toString()).toBe("ping");
    server.socket.send(Buffer.from("pong"), from.port, "127.0.0.1");
    await expect.poll(() => received.map(String)).toEqual(["pong"]);

    channel.close();
    channel.close();
    channel.send(Buffer.from("after close"));
  });

  it("opens an IPv6 socket for an IPv6 literal", async () => {
    const server = await udpServer("udp6", "::1");
    const channel = await openUdpChannel({ host: "::1", port: server.port });
    channel.send(Buffer.from("six"));
    const [request] = (await once(server.socket, "message")) as [Buffer];
    expect(request.toString()).toBe("six");
    channel.close();
  });

  it("rejects with a socket error for a port out of range", async () => {
    await expect(openUdpChannel({ host: "127.0.0.1", port: 70_000 })).rejects.toMatchObject({ code: "socketError" });
  });

  it("rejects with the abort reason, before and during the connect", async () => {
    const before = new AbortController();
    before.abort(new Error("before"));
    await expect(openUdpChannel({ host: "127.0.0.1", port: 9 }, before.signal)).rejects.toThrow("before");
    const during = new AbortController();
    const pending = openUdpChannel({ host: "127.0.0.1", port: 9 }, during.signal);
    during.abort(new Error("during"));
    await expect(pending).rejects.toThrow("during");
  });

  it("reports a send that throws as an error on a later turn and closes", async () => {
    const server = await udpServer("udp4", "127.0.0.1");
    const channel = await openUdpChannel({ host: "127.0.0.1", port: server.port });
    const errors: TeamSpeakTransportError[] = [];
    channel.attach({ message: () => undefined, error: (error) => errors.push(error) });
    channel.send(42 as unknown as Uint8Array);
    expect(errors).toHaveLength(0);
    await expect.poll(() => errors.map((error) => error.code)).toEqual(["socketError"]);
    channel.send(Buffer.from("closed now"));
  });
});

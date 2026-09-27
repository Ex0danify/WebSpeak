import { createSocket, type RemoteInfo, type Socket } from "node:dgram";
import { afterEach, describe, expect, it } from "vitest";
import { INIT_VERSION } from "@echosixhiya/teamspeak-client/handshake";
import { buildInitPacket, probeTeamSpeak, readInitAnswer, TeamSpeakProbeError } from "./teamspeak-probe.js";

// The probe against a real UDP socket on the loopback interface that plays the TeamSpeak server:
// it answers the first handshake packet, stays silent, or answers with something else.

const sockets: Socket[] = [];
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close();
});

type Handler = (packet: Buffer, reply: (datagram: Buffer) => void, count: number) => void;

/** A UDP socket on 127.0.0.1, `::1` or `::` (both families) that calls `handler` for every datagram. Returns its port and the datagrams it got. */
async function udpServer(handler: Handler, address = "127.0.0.1"): Promise<{ port: number; received: Buffer[] }> {
  const socket = createSocket(address === "127.0.0.1" ? "udp4" : "udp6");
  sockets.push(socket);
  const received: Buffer[] = [];
  socket.on("message", (packet: Buffer, remote: RemoteInfo) => {
    received.push(packet);
    handler(packet, (datagram) => socket.send(datagram, remote.port, remote.address), received.length);
  });
  await new Promise<void>((resolve) => socket.bind(0, address, resolve));
  return { port: socket.address().port, received };
}

/** The answer a TeamSpeak server gives to step 0: step 1, sixteen random bytes, the client's random bytes reversed. */
function step1For(packet: Buffer, overrides: { echo?: Buffer } = {}): Buffer {
  const answer = Buffer.alloc(11 + 21);
  answer.write("TS3INIT1", 0);
  answer.writeUInt16BE(101, 8);
  answer[10] = 0x08;
  answer[11] = 1;
  const echo = overrides.echo ?? Buffer.from(packet.subarray(13 + 9, 13 + 13)).reverse();
  echo.copy(answer, 11 + 17);
  return answer;
}

const fast = { attempts: 3, attemptTimeoutMs: 80 };
const answering: Handler = (packet, reply) => reply(step1For(packet));

describe("the handshake packet", () => {
  it("is the client's step 0: MAC, Init1 header, protocol version, step 0, timestamp and the random bytes", () => {
    const packet = buildInitPacket(Buffer.from([1, 2, 3, 4]));
    expect(packet).toHaveLength(34);
    expect(packet.subarray(0, 8).toString()).toBe("TS3INIT1");
    expect([packet.readUInt16BE(8), packet.readUInt16BE(10), packet[12]]).toEqual([101, 0, 0x08]);
    expect(packet.readUInt32BE(13)).toBe(INIT_VERSION);
    expect(packet[17]).toBe(0);
    expect(Math.abs(packet.readUInt32BE(18) - Date.now() / 1000)).toBeLessThan(5);
    expect([...packet.subarray(22, 26)]).toEqual([1, 2, 3, 4]);
  });

  it("is what readInitAnswer recognises the answer to: step 1 with the random bytes reversed, and nothing else", () => {
    const packet = buildInitPacket(Buffer.from([1, 2, 3, 4]));
    expect(readInitAnswer(step1For(packet))).toBe("01020304");
    expect(readInitAnswer(packet)).toBeNull(); // the client's own packet is not an answer
    expect(readInitAnswer(Buffer.from("HTTP/1.1 400 Bad Request\r\n\r\n"))).toBeNull();
    const wrongStep = step1For(packet);
    wrongStep[11] = 3;
    expect(readInitAnswer(wrongStep)).toBeNull();
    const wrongType = step1For(packet);
    wrongType[10] = 0x02;
    expect(readInitAnswer(wrongType)).toBeNull();
    expect(readInitAnswer(step1For(packet).subarray(0, 30))).toBeNull();
  });
});

describe("probeTeamSpeak", () => {
  it("succeeds when the port answers the first packet, with the round trip, after sending exactly one packet", async () => {
    const server = await udpServer(answering);
    const result = await probeTeamSpeak({ host: "127.0.0.1", port: server.port }, fast);
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.latencyMs).toBeLessThan(80);
    expect(server.received).toHaveLength(1);
    expect(server.received[0].subarray(0, 8).toString()).toBe("TS3INIT1");
    expect(server.received[0].readUInt32BE(13)).toBe(INIT_VERSION);
  });

  it("fails with NO_ANSWER when the port is silent, after sending every attempt", async () => {
    const server = await udpServer(() => undefined);
    const started = Date.now();
    const error = await probeTeamSpeak({ host: "127.0.0.1", port: server.port }, fast).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(TeamSpeakProbeError);
    expect(error).toMatchObject({ code: "NO_ANSWER" });
    expect(Date.now() - started).toBeGreaterThanOrEqual(3 * 80 - 10);
    expect(server.received).toHaveLength(3);
    // Every attempt carries its own random bytes.
    expect(new Set(server.received.map((packet) => packet.subarray(22, 26).toString("hex"))).size).toBe(3);
  });

  it("asks again when a packet is lost, and succeeds on the answer to a later one", async () => {
    const server = await udpServer((packet, reply, count) => { if (count === 2) reply(step1For(packet)); });
    await expect(probeTeamSpeak({ host: "127.0.0.1", port: server.port }, fast)).resolves.toMatchObject({ ok: true });
    expect(server.received).toHaveLength(2);
  });

  it("counts a late answer to an earlier packet", async () => {
    const server = await udpServer((_packet, reply, count) => { if (count === 2) reply(step1For(server.received[0])); });
    await expect(probeTeamSpeak({ host: "127.0.0.1", port: server.port }, fast)).resolves.toMatchObject({ ok: true });
  });

  it("fails with PROTOCOL_NEGOTIATION_FAILED when another service answers on the port", async () => {
    const server = await udpServer((_packet, reply) => reply(Buffer.from("HTTP/1.1 400 Bad Request\r\n\r\n")));
    await expect(probeTeamSpeak({ host: "127.0.0.1", port: server.port }, fast)).rejects.toMatchObject({ code: "PROTOCOL_NEGOTIATION_FAILED" });
  });

  it("does not take an answer that echoes other random bytes for its own", async () => {
    const server = await udpServer((packet, reply) => reply(step1For(packet, { echo: Buffer.from([9, 9, 9, 9]) })));
    await expect(probeTeamSpeak({ host: "127.0.0.1", port: server.port }, fast)).rejects.toMatchObject({ code: "PROTOCOL_NEGOTIATION_FAILED" });
  });

  it("fails with CONNECTION_REFUSED when the host answers that nothing listens on the port", async () => {
    const closed = await udpServer(() => undefined);
    const port = closed.port;
    sockets.pop()!.close();
    await expect(probeTeamSpeak({ host: "127.0.0.1", port }, fast)).rejects.toMatchObject({ code: "CONNECTION_REFUSED" });
  });

  it("fails with HOST_NOT_FOUND for a name that does not resolve", async () => {
    await expect(probeTeamSpeak({ host: "no-such-host.invalid", port: 9987 }, fast)).rejects.toMatchObject({ code: "HOST_NOT_FOUND" });
  });

  it("reaches an IPv6 address", async () => {
    const server = await udpServer(answering, "::1").catch(() => null);
    if (!server) return; // no IPv6 loopback on this machine
    await expect(probeTeamSpeak({ host: "::1", port: server.port }, fast)).resolves.toMatchObject({ ok: true });
  });

  it("resolves a host name", async () => {
    const server = await udpServer(answering, "::").catch(() => null); // "localhost" may resolve to either family
    if (!server) return; // no IPv6 on this machine
    await expect(probeTeamSpeak({ host: "localhost", port: server.port }, fast)).resolves.toMatchObject({ ok: true });
  });
});

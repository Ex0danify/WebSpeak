import { randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { createSocket, type Socket } from "node:dgram";
import { isIP } from "node:net";
import { INIT_VERSION } from "@echosixhiya/teamspeak-client/handshake";
import type { TeamSpeakTarget } from "../../shared/teamSpeakTarget.js";

/**
 * What the admin console's "Test connection" can tell about the voice port.
 *
 * NO_ANSWER: the port stayed silent (nothing listens, a firewall drops the packets, or the
 * server process is down). PROTOCOL_NEGOTIATION_FAILED: something answered, but not with the
 * TeamSpeak handshake (a different service on that port).
 */
export type ProbeErrorCode =
  | "HOST_NOT_FOUND"
  | "UNREACHABLE"
  | "CONNECTION_REFUSED"
  | "NO_ANSWER"
  | "PROTOCOL_NEGOTIATION_FAILED"
  | "INTERNAL_ERROR";

export interface TeamSpeakProbeResult {
  ok: true;
  /** Round trip of the handshake packet, in milliseconds. */
  latencyMs: number;
}

export interface TeamSpeakProbeOptions {
  /** Packets sent before the port counts as silent. Default 3. */
  attempts?: number;
  /** How long each packet waits for its answer. Default 1000 ms. */
  attemptTimeoutMs?: number;
}

export class TeamSpeakProbeError extends Error {
  constructor(readonly code: ProbeErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = "TeamSpeakProbeError";
  }
}

// The first packet of the TeamSpeak connection handshake ("Init1", step 0), as the client SDK
// sends it before anything else. The server answers with step 1 and holds no state for the
// sender until the later steps (which are never sent here), so nothing shows up in a channel.
// Layout of a client packet: MAC "TS3INIT1" (8), packet id (2), client id (2), type (1), then
// version (4), step (1), timestamp (4), four random bytes (4), zero padding (8).
const INIT1_MAC = Buffer.from("TS3INIT1");
const INIT1_TYPE = 0x08;
const INIT1_PACKET_ID = 101;
const CLIENT_HEADER_LENGTH = 13;
const SERVER_HEADER_LENGTH = 11;
const STEP_0_LENGTH = 21;
const STEP_1_LENGTH = 21;

export function buildInitPacket(random: Buffer): Buffer {
  const packet = Buffer.alloc(CLIENT_HEADER_LENGTH + STEP_0_LENGTH);
  INIT1_MAC.copy(packet, 0);
  packet.writeUInt16BE(INIT1_PACKET_ID, 8);
  packet.writeUInt16BE(0, 10);
  packet[12] = INIT1_TYPE;
  const data = CLIENT_HEADER_LENGTH;
  packet.writeUInt32BE(INIT_VERSION, data);
  packet[data + 4] = 0;
  packet.writeUInt32BE(Math.floor(Date.now() / 1000) >>> 0, data + 5);
  random.copy(packet, data + 9, 0, 4);
  return packet;
}

/**
 * The answer to step 0 is step 1: an Init1 packet whose data is the step byte 1, sixteen random
 * bytes and the client's four random bytes in reverse order. Returns the client's random bytes
 * (as hex) it echoes, or null when the datagram is not that answer.
 */
export function readInitAnswer(datagram: Buffer): string | null {
  if (datagram.length < SERVER_HEADER_LENGTH + STEP_1_LENGTH) return null;
  if ((datagram[10] & 0x0f) !== INIT1_TYPE) return null;
  const data = datagram.subarray(SERVER_HEADER_LENGTH);
  if (data[0] !== 1) return null;
  return Buffer.from(data.subarray(17, 21)).reverse().toString("hex");
}

/**
 * Checks that something answers the TeamSpeak protocol on the voice port (UDP) of `target`, by
 * sending the first handshake packet and waiting for the server's reply. It does not log in, so
 * it never creates a client and cannot check the server password. Resolves with the round trip or
 * throws a `TeamSpeakProbeError`.
 */
export async function probeTeamSpeak(target: TeamSpeakTarget, options: TeamSpeakProbeOptions = {}): Promise<TeamSpeakProbeResult> {
  const attempts = Math.max(1, Math.min(8, Math.floor(options.attempts ?? 3)));
  const attemptTimeoutMs = Math.max(50, Math.min(5_000, Math.floor(options.attemptTimeoutMs ?? 1_000)));
  const { address, family } = await resolveHost(target.host);
  const socket = createSocket(family === 6 ? "udp6" : "udp4");
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject);
      socket.connect(target.port, address, () => {
        socket.off("error", reject);
        resolve();
      });
    });
    return await exchange(socket, attempts, attemptTimeoutMs);
  } catch (error: unknown) {
    throw toProbeError(error);
  } finally {
    try {
      socket.close();
    } catch {
      // Already closed.
    }
  }
}

function exchange(socket: Socket, attempts: number, attemptTimeoutMs: number): Promise<TeamSpeakProbeResult> {
  return new Promise((resolve, reject) => {
    const sentAt = new Map<string, number>();
    let sent = 0;
    let receivedOther = false;
    let timer: NodeJS.Timeout | undefined;
    const done = (finish: () => void): void => {
      clearTimeout(timer);
      socket.removeAllListeners("message");
      socket.removeAllListeners("error");
      socket.on("error", () => undefined);
      finish();
    };
    const sendNext = (): void => {
      if (sent >= attempts) {
        done(() => reject(receivedOther
          ? new TeamSpeakProbeError("PROTOCOL_NEGOTIATION_FAILED", "Something answered on the voice port, but not with the TeamSpeak handshake")
          : new TeamSpeakProbeError("NO_ANSWER", "Nothing answered on the voice port")));
        return;
      }
      sent += 1;
      // A fresh random per packet tells which one an answer belongs to, so a late answer to
      // an earlier packet still counts and its round trip is measured from that packet.
      const random = randomBytes(4);
      sentAt.set(Buffer.from(random).toString("hex"), Date.now());
      timer = setTimeout(sendNext, attemptTimeoutMs);
      socket.send(buildInitPacket(random), (error) => {
        if (error) done(() => reject(error));
      });
    };
    socket.on("message", (datagram) => {
      const echoed = readInitAnswer(datagram);
      const sentTime = echoed === null ? undefined : sentAt.get(echoed);
      if (sentTime === undefined) {
        receivedOther = true;
        return;
      }
      done(() => resolve({ ok: true, latencyMs: Math.max(0, Date.now() - sentTime) }));
    });
    socket.on("error", (error) => done(() => reject(error)));
    sendNext();
  });
}

async function resolveHost(host: string): Promise<{ address: string; family: 4 | 6 }> {
  const literal = isIP(host);
  if (literal === 4 || literal === 6) return { address: host, family: literal };
  try {
    const resolved = await lookup(host);
    return { address: resolved.address, family: resolved.family === 6 ? 6 : 4 };
  } catch (error: unknown) {
    throw toProbeError(error);
  }
}

export function toProbeError(error: unknown): TeamSpeakProbeError {
  if (error instanceof TeamSpeakProbeError) return error;
  const code = typeof (error as { code?: unknown } | null)?.code === "string" ? (error as { code: string }).code : "";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "EAI_NONAME") {
    return new TeamSpeakProbeError("HOST_NOT_FOUND", "TeamSpeak host was not found", error);
  }
  if (code === "ECONNREFUSED") {
    return new TeamSpeakProbeError("CONNECTION_REFUSED", "The host refused the packet: nothing listens on the voice port", error);
  }
  if (code === "EHOSTUNREACH" || code === "ENETUNREACH" || code === "ENETDOWN" || code === "EHOSTDOWN") {
    return new TeamSpeakProbeError("UNREACHABLE", "TeamSpeak host is unreachable", error);
  }
  return new TeamSpeakProbeError("INTERNAL_ERROR", "Connection test failed", error);
}

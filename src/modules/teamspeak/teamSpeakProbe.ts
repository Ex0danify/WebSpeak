import { randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { createSocket, type Socket } from "node:dgram";
import { isIP } from "node:net";
import { INIT_VERSION } from "../../lib/teamspeak/index.js";
import type { TeamSpeakTarget } from "../../shared/teamSpeakTarget.js";

/**
 * What the admin "Test connection" can tell about the voice port. NO_ANSWER is silence (nothing
 * listens, firewall, server down), PROTOCOL_NEGOTIATION_FAILED means another service answered.
 */
export type ProbeErrorCode =
  "HOST_NOT_FOUND" | "UNREACHABLE" | "CONNECTION_REFUSED" | "NO_ANSWER" | "PROTOCOL_NEGOTIATION_FAILED" | "INTERNAL_ERROR";

export interface TeamSpeakProbeResult {
  ok: true;
  latencyMs: number;
}

export interface TeamSpeakProbeOptions {
  /** Packets sent before the port counts as silent. Default 3. */
  attempts?: number;
  /** How long each packet waits for its answer. Default 1000 ms. */
  attemptTimeoutMs?: number;
}

export class TeamSpeakProbeError extends Error {
  constructor(
    readonly code: ProbeErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "TeamSpeakProbeError";
  }
}

// First packet of the TS handshake (Init1 step 0), sent like the SDK does. The server keeps no
// state until later steps, so nothing shows in a channel. Layout: MAC TS3INIT1, packet id (2),
// client id (2), type (1), version (4), step (1), time (4), random (4), padding (8).
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
 * The first packet is answered by the second handshake stage (step byte 1, 16 random bytes, our 4 random bytes reversed).
 * Returns our echoed bytes as hex, or null if the datagram is not that answer.
 */
export function readInitAnswer(datagram: Buffer): string | null {
  if (datagram.length < SERVER_HEADER_LENGTH + STEP_1_LENGTH) return null;
  if ((datagram[10] & 0x0f) !== INIT1_TYPE) return null;
  const data = datagram.subarray(SERVER_HEADER_LENGTH);
  if (data[0] !== 1) return null;
  return Buffer.from(data.subarray(17, 21)).reverse().toString("hex");
}

/**
 * Checks that something speaks the TS protocol on the UDP voice port by sending the first handshake
 * packet. No login, so no client and no password check. Resolves with the round trip or throws.
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
        done(() =>
          reject(
            receivedOther
              ? new TeamSpeakProbeError(
                  "PROTOCOL_NEGOTIATION_FAILED",
                  "Something answered on the voice port, but not with the TeamSpeak handshake",
                )
              : new TeamSpeakProbeError("NO_ANSWER", "Nothing answered on the voice port"),
          ),
        );
        return;
      }
      sent += 1;
      // Fresh random per packet so a late answer to an earlier one still counts, timed from that packet.
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

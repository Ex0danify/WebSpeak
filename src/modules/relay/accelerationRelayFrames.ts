import { createHmac, timingSafeEqual } from "node:crypto";

const MAGIC = Buffer.from("WSAT");
const VERSION = 1;
const HEADER_SIZE = 34;
const MAX_PAYLOAD_SIZE = 60_000;

export const enum FrameType {
  OPEN = 1,
  OPEN_OK = 2,
  OPEN_ERR = 3,
  DATA = 4,
  CLOSE = 5,
  PING = 6,
  PONG = 7,
}

export interface Frame {
  type: FrameType;
  sessionId: number;
  sequence: number;
  payload: Buffer;
  auth: Buffer;
  raw: Buffer;
}

export function encodeFrame(type: FrameType, sessionId: number, sequence: number, payload: Buffer, token: string): Buffer {
  if (payload.length > MAX_PAYLOAD_SIZE) throw new Error("Acceleration relay payload is too large");
  const frame = Buffer.alloc(HEADER_SIZE + payload.length);
  MAGIC.copy(frame, 0);
  frame[4] = VERSION;
  frame[5] = type;
  frame.writeUInt32BE(sessionId >>> 0, 8);
  frame.writeUInt32BE(sequence >>> 0, 12);
  frame.writeUInt16BE(payload.length, 16);
  payload.copy(frame, HEADER_SIZE);
  signFrame(frame, payload, token).copy(frame, 18);
  return frame;
}

export function decodeFrame(packet: Buffer): Frame | null {
  if (packet.length < HEADER_SIZE || !packet.subarray(0, 4).equals(MAGIC) || packet[4] !== VERSION) return null;
  const payloadLength = packet.readUInt16BE(16);
  if (packet.length !== HEADER_SIZE + payloadLength || payloadLength > MAX_PAYLOAD_SIZE) return null;
  return {
    type: packet[5] as FrameType,
    sessionId: packet.readUInt32BE(8),
    sequence: packet.readUInt32BE(12),
    payload: packet.subarray(HEADER_SIZE),
    auth: packet.subarray(18, HEADER_SIZE),
    raw: packet,
  };
}

export function verifyFrame(frame: Frame, token: string): boolean {
  const expected = signFrame(frame.raw, frame.payload, token);
  return expected.length === frame.auth.length && timingSafeEqual(expected, frame.auth);
}

function signFrame(frame: Buffer, payload: Buffer, token: string): Buffer {
  return createHmac("sha256", Buffer.from(token, "utf8")).update(frame.subarray(0, 18)).update(payload).digest().subarray(0, 16);
}

export function jsonPayload(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value), "utf8");
}

export function parseJson(payload: Buffer): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(payload.toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

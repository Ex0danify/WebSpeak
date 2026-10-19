import type { PacketDirection } from "../crypto/packetKeys.js";

export const PacketType = {
  voice: 0,
  voiceWhisper: 1,
  command: 2,
  commandLow: 3,
  ping: 4,
  pong: 5,
  ack: 6,
  ackLow: 7,
  init1: 8,
} as const;
export type PacketType = (typeof PacketType)[keyof typeof PacketType];
export const PACKET_TYPE_COUNT = 9;

export const PacketFlag = { fragmented: 0x10, newProtocol: 0x20, compressed: 0x40, unencrypted: 0x80 } as const;

export const MAC_BYTES = 8;
export const MAX_DATAGRAM_BYTES = 500;
export const INIT1_MAC = Buffer.from("TS3INIT1");
export const INIT1_PACKET_ID = 101;

/** Client to server: id, client id, type and flags. Server to client has no client id. */
export function headerBytes(direction: PacketDirection): number {
  return direction === "c2s" ? 5 : 3;
}

/** Room for the payload in one datagram, 487 bytes from the client and 489 from the server. */
export function maxPayloadBytes(direction: PacketDirection): number {
  return MAX_DATAGRAM_BYTES - MAC_BYTES - headerBytes(direction);
}

export function isReliable(type: number): type is typeof PacketType.command | typeof PacketType.commandLow {
  return type === PacketType.command || type === PacketType.commandLow;
}

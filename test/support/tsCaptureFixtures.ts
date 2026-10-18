// Raw packet captures of the native client. They stay local (teamspeak-client-plan/fixtures/), so
// tests that use them skip in CI.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fixtureDir = fileURLToPath(new URL("../../teamspeak-client-plan/fixtures/", import.meta.url));

export const CAPTURE_FILES = ["ts3LegacyPackets.json", "ts6AlphaPackets.json"] as const;
export type CaptureFile = (typeof CAPTURE_FILES)[number];

export const hasCaptures = CAPTURE_FILES.every((file) => existsSync(`${fixtureDir}${file}`));

export interface CapturedPacket {
  direction: "c2s" | "s2c";
  packetId: number;
  type: number;
  flags: number;
  raw: Buffer;
  /** Encrypted packets only. */
  key?: Buffer;
  nonce?: Buffer;
  plain?: Buffer;
  fakeMac?: Buffer;
}

export interface CapturedMessage {
  direction: "c2s" | "s2c";
  name: string;
  packetIds: number[];
  compressed: boolean;
}

interface RawPacket {
  direction: "c2s" | "s2c";
  packetId: string;
  type: string;
  flags: string;
  raw: string;
  key?: string;
  nonce?: string;
  plain?: string;
  fakeMac?: string;
}

const hex = (value: string | undefined) => (value === undefined ? undefined : Buffer.from(value, "hex"));

export function loadCapture(file: CaptureFile): { packets: CapturedPacket[]; messages: CapturedMessage[] } {
  const capture = JSON.parse(readFileSync(`${fixtureDir}${file}`, "utf8")) as {
    packets: RawPacket[];
    messages: (CapturedMessage & { dropped: boolean })[];
  };
  return {
    packets: capture.packets.map((packet) => ({
      direction: packet.direction,
      packetId: Number(packet.packetId),
      type: Number(packet.type),
      flags: Number(packet.flags),
      raw: Buffer.from(packet.raw, "hex"),
      key: hex(packet.key),
      nonce: hex(packet.nonce),
      plain: hex(packet.plain),
      fakeMac: hex(packet.fakeMac),
    })),
    messages: capture.messages.filter((message) => !message.dropped),
  };
}

/** Plaintext of every server command packet by id, first copy wins (resends are identical). */
export function serverCommandParts(packets: CapturedPacket[]): Map<number, CapturedPacket> {
  const parts = new Map<number, CapturedPacket>();
  for (const packet of packets)
    if (packet.direction === "s2c" && packet.type === 2 && packet.plain && !parts.has(packet.packetId)) parts.set(packet.packetId, packet);
  return parts;
}

export const SESSION_FILES = ["ts3ServerSession.json", "ts6ServerSession.json"] as const;
export type SessionFile = (typeof SESSION_FILES)[number];

export const hasSessions = SESSION_FILES.every((file) => existsSync(`${fixtureDir}${file}`));

/** Decrypted command texts of a native client session, server side only, in arrival order. */
export function loadServerCommands(file: SessionFile): string[] {
  const session = JSON.parse(readFileSync(`${fixtureDir}${file}`, "utf8")) as {
    commands: { direction: "c2s" | "s2c"; text: string }[];
  };
  return session.commands.filter((command) => command.direction === "s2c").map((command) => command.text);
}

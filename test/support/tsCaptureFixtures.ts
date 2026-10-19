// Local capture fixtures of the native client, never committed. Their folder comes from
// TEST_FIXTURE_FOLDER (env or .env); without it every fixture-backed test skips.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function readDotEnvFolder(): string | undefined {
  try {
    for (const raw of readFileSync(fileURLToPath(new URL("../../.env", import.meta.url)), "utf8").split("\n")) {
      const line = raw.trim();
      if (line.startsWith("TEST_FIXTURE_FOLDER=")) return line.slice("TEST_FIXTURE_FOLDER=".length).trim().replace(/^["']|["']$/g, "") || undefined;
    }
  } catch {
    // no .env
  }
  return undefined;
}

function resolveFixtureFolder(): string | undefined {
  const folder = process.env.TEST_FIXTURE_FOLDER?.trim() || readDotEnvFolder();
  if (!folder) return undefined;
  return folder.endsWith("/") ? folder : `${folder}/`;
}

/** The fixture folder with a trailing slash, or undefined when TEST_FIXTURE_FOLDER is not set. */
export const fixtureFolder = resolveFixtureFolder();
export const hasFixtureFolder = fixtureFolder !== undefined;

/** Full path of a fixture, or undefined without a folder. */
export const fixtureFile = (name: string): string | undefined => (fixtureFolder === undefined ? undefined : `${fixtureFolder}${name}`);

/** Whether a named fixture is present in the configured folder. */
export function hasFixture(name: string): boolean {
  const path = fixtureFile(name);
  return path !== undefined && existsSync(path);
}

/** The one place that names each fixture file. Rename a file here, not in the tests. */
export const FIXTURES = {
  ts3Packets: "ts3LegacyPackets.json",
  ts6Packets: "ts6AlphaPackets.json",
  alphaSchedule: "ts6AlphaKeySchedule.json",
  handshakeVectors: "handshakeVectors.json",
  ts3Session: "ts3ServerSession.json",
  ts6Session: "ts6ServerSession.json",
} as const;

export const CAPTURE_FILES = [FIXTURES.ts3Packets, FIXTURES.ts6Packets] as const;
export type CaptureFile = (typeof CAPTURE_FILES)[number];

export const hasCaptures = CAPTURE_FILES.every((file) => hasFixture(file));

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
  const capture = JSON.parse(readFileSync(fixtureFile(file)!, "utf8")) as {
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

export const SESSION_FILES = [FIXTURES.ts3Session, FIXTURES.ts6Session] as const;
export type SessionFile = (typeof SESSION_FILES)[number];

export const hasSessions = SESSION_FILES.every((file) => hasFixture(file));

/** Decrypted command texts of a native client session, server side only, in arrival order. */
export function loadServerCommands(file: SessionFile): string[] {
  const session = JSON.parse(readFileSync(fixtureFile(file)!, "utf8")) as {
    commands: { direction: "c2s" | "s2c"; text: string }[];
  };
  return session.commands.filter((command) => command.direction === "s2c").map((command) => command.text);
}

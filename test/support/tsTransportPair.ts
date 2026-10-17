// A client and a server PacketHandler of the own TeamSpeak client over a simulated link.
import { LegacyPacketKeys } from "../../src/lib/teamspeak/crypto/packetKeys.js";
import type { TeamSpeakTransportError } from "../../src/lib/teamspeak/errors/teamSpeakErrors.js";
import {
  type CommandMessage,
  PacketHandler,
  type PacketHandlerOptions,
  type VoicePacket,
} from "../../src/lib/teamspeak/transport/packetHandler.js";
import { createLink, type LinkImpairment, ManualClock } from "./tsLinkSimulator.js";

export interface Endpoint {
  handler: PacketHandler;
  commands: CommandMessage[];
  voice: VoicePacket[];
  init1: Buffer[];
  closed: (TeamSpeakTransportError | undefined)[];
}

export const TEST_FAKE_MAC = Buffer.from("f00dfeedc0ffee11", "hex");

export interface TransportPairOptions {
  impairment?: LinkImpairment;
  seed?: number;
  options?: PacketHandlerOptions;
  /** Switch both sides to session keys right away. Default true. */
  sessionKeys?: boolean;
}

export function createTransportPair({ impairment, seed, options, sessionKeys = true }: TransportPairOptions = {}) {
  const clock = new ManualClock();
  const link = createLink(clock, impairment, seed);
  const endpoint = (channel: typeof link.a, role: "client" | "server"): Endpoint => {
    const ends: Omit<Endpoint, "handler"> = { commands: [], voice: [], init1: [], closed: [] };
    const handler = new PacketHandler(
      channel,
      {
        command: (message) => ends.commands.push(message),
        voice: (packet) => ends.voice.push(packet),
        init1: (payload) => ends.init1.push(payload),
        closed: (error) => ends.closed.push(error),
      },
      { clock, ...options, role },
    );
    return { handler, ...ends };
  };
  const client = endpoint(link.a, "client");
  const server = endpoint(link.b, "server");
  if (sessionKeys) {
    const keys = new LegacyPacketKeys(Buffer.from("00112233445566778899aabbccddeeff0011223344556677", "hex"));
    client.handler.switchKeys({ keys, fakeMac: TEST_FAKE_MAC });
    server.handler.switchKeys({ keys, fakeMac: TEST_FAKE_MAC });
  }
  return { clock, link, client, server };
}

export const texts = (messages: { payload: Buffer }[]) => messages.map((message) => message.payload.toString());

/** Packet type of a datagram the given side sent. */
export const datagramType = (datagram: Buffer, from: "a" | "b") => datagram[from === "a" ? 12 : 10] & 0x0f;
export const datagramId = (datagram: Buffer) => datagram.readUInt16BE(8);

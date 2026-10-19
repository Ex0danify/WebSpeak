import { describe, expect, it } from "vitest";
import { type CaptureFile, FIXTURES, hasCaptures, loadCapture } from "../../../../test/support/tsCaptureFixtures.js";
import { ManualClock } from "../../../../test/support/tsLinkSimulator.js";
import { DUMMY_PACKET_KEY, type PacketKey, type PacketKeySchedule } from "../crypto/packetKeys.js";
import { type CommandMessage, PacketHandler } from "./packetHandler.js";
import { PacketFlag, PacketType } from "./packetTypes.js";
import type { DatagramChannel, DatagramHandlers } from "./udpChannel.js";

/** The keys the native client used, looked up per packet; the schedule itself is not under test here. */
class CapturedKeys implements PacketKeySchedule {
  readonly #keys = new Map<string, PacketKey>();

  constructor(packets: ReturnType<typeof loadCapture>["packets"]) {
    for (const packet of packets)
      if (packet.key && packet.nonce)
        this.#keys.set(`${packet.direction}:${packet.type}:${packet.packetId}`, { key: packet.key, nonce: packet.nonce });
  }

  keyFor(direction: string, type: number, _generation: number, id: number): PacketKey {
    return this.#keys.get(`${direction}:${type}:${id}`) ?? DUMMY_PACKET_KEY;
  }
}

function replay(file: CaptureFile) {
  const { packets, messages } = loadCapture(file);
  let handlers: DatagramHandlers | undefined;
  const sent: Buffer[] = [];
  const channel: DatagramChannel = {
    attach: (next) => void (handlers = next),
    send: (datagram) => void sent.push(Buffer.from(datagram)),
    close: () => undefined,
  };
  const commands: CommandMessage[] = [];
  const init1: Buffer[] = [];
  const handler = new PacketHandler(
    channel,
    { command: (message) => commands.push(message), init1: (payload) => init1.push(payload), closed: () => undefined },
    { clock: new ManualClock() },
  );
  const fakeMac = packets.find((packet) => packet.type !== PacketType.init1 && packet.flags & PacketFlag.unencrypted)!.fakeMac!;
  handler.switchKeys({ keys: new CapturedKeys(packets), fakeMac, receiveFrom: { [PacketType.command]: 0, [PacketType.ack]: 0 } });
  for (const packet of packets) if (packet.direction === "s2c") handlers!.message(packet.raw);
  const expected = messages.filter((message) => message.direction === "s2c");
  return { commands, init1, sent, expected, handler };
}

describe.skipIf(!hasCaptures)("PacketHandler replaying the captured server side", () => {
  it("delivers every TS6 server command in order, decompressed and reassembled", () => {
    const { commands, init1, expected } = replay(FIXTURES.ts6Packets);
    expect(init1).toHaveLength(1);
    expect(commands.map((message) => message.payload.toString("utf8").split(" ", 1)[0])).toEqual(expected.map((message) => message.name));
    expect(Math.max(...commands.map((message) => message.payload.length))).toBe(21_391);
  });

  it("stops at the TS3 command that was cut from the capture instead of skipping it", () => {
    const { commands, expected, handler } = replay(FIXTURES.ts3Packets);
    // Server command 21 (a notifyclientupdated with account data) was removed from the capture.
    const beforeGap = expected.filter((message) => Math.max(...message.packetIds) < 21);
    expect(beforeGap.length).toBeLessThan(expected.length);
    expect(commands.map((message) => message.payload.toString("utf8").split(" ", 1)[0])).toEqual(beforeGap.map((message) => message.name));
    expect(handler.closed).toBe(false);
  });

  it("acks every server command and answers every server ping", () => {
    const { sent } = replay(FIXTURES.ts6Packets);
    const { packets } = loadCapture(FIXTURES.ts6Packets);
    const types = (type: number) => sent.filter((datagram) => (datagram[12] & 0x0f) === type).length;
    const serverPackets = (type: number) => packets.filter((packet) => packet.direction === "s2c" && packet.type === type).length;
    expect(types(PacketType.ack)).toBe(serverPackets(PacketType.command));
    expect(types(PacketType.pong)).toBe(serverPackets(PacketType.ping));
  });
});

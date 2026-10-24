import { describe, expect, it } from "vitest";
import { DUMMY_PACKET_KEY, DUMMY_PACKET_KEY_256, Ts3PacketKeys } from "../crypto/packetKeys.js";
import { FixedPacketKeys, PacketProtection } from "./packetProtection.js";
import { PacketType } from "./packetTypes.js";

const session = new Ts3PacketKeys(Buffer.alloc(64, 7));
const cursors = (command: number, ack: number) => [0, 0, command, 0, 0, 0, ack, 0, 0];

describe("PacketProtection", () => {
  it("starts with the dummy key and a zero fake MAC that it does not check", () => {
    const protection = new PacketProtection("c2s");
    expect(protection.sealKey(PacketType.command, 0)).toBe(DUMMY_PACKET_KEY);
    expect(protection.openKeys(PacketType.command, 5)).toEqual([DUMMY_PACKET_KEY]);
    expect(protection.fakeMac.equals(Buffer.alloc(8))).toBe(true);
    expect(protection.expectedFakeMac).toBeUndefined();
  });

  it("seals with the newest keys and opens by the index the peer switched at", () => {
    const protection = new PacketProtection("c2s");
    protection.switchKeys({ keys: session, fakeMac: Buffer.alloc(8, 1) }, cursors(1, 0));
    expect(protection.sealKey(PacketType.command, 0x10002)).toEqual(session.keyFor("c2s", 2, 1, 2));
    expect(protection.openKeys(PacketType.command, 0)).toEqual([DUMMY_PACKET_KEY]);
    expect(protection.openKeys(PacketType.command, 1)).toEqual([session.keyFor("s2c", 2, 0, 1)]);
    expect(protection.expectedFakeMac?.equals(Buffer.alloc(8, 1))).toBe(true);
  });

  it("lets a switch set explicit start indexes per type", () => {
    const protection = new PacketProtection("c2s");
    protection.switchKeys({ keys: new FixedPacketKeys(DUMMY_PACKET_KEY_256), receiveFrom: { [PacketType.command]: 0 } }, cursors(5, 0));
    expect(protection.openKeys(PacketType.command, 0)).toEqual([DUMMY_PACKET_KEY_256]);
  });

  it("offers older keys for acks only, newest first", () => {
    const protection = new PacketProtection("c2s");
    protection.switchKeys({ keys: new FixedPacketKeys(DUMMY_PACKET_KEY_256) }, cursors(0, 0));
    protection.switchKeys({ keys: session }, cursors(0, 0));
    expect(protection.openKeys(PacketType.ack, 0)).toEqual([session.keyFor("s2c", 6, 0, 0), DUMMY_PACKET_KEY_256, DUMMY_PACKET_KEY]);
    expect(protection.openKeys(PacketType.command, 0)).toHaveLength(1);
  });

  it("keeps three epochs at most and keeps the fake MAC when a switch brings none", () => {
    const protection = new PacketProtection("s2c");
    protection.switchKeys({ keys: session, fakeMac: Buffer.alloc(8, 2) }, cursors(0, 0));
    protection.switchKeys({ keys: session }, cursors(0, 0));
    protection.switchKeys({ keys: session }, cursors(0, 0));
    expect(protection.openKeys(PacketType.ackLow, 0)).toHaveLength(3);
    expect(protection.fakeMac.equals(Buffer.alloc(8, 2))).toBe(true);
  });

  it("rejects a fake MAC of the wrong length", () => {
    expect(() => new PacketProtection("c2s").switchKeys({ keys: session, fakeMac: Buffer.alloc(4) }, cursors(0, 0))).toThrow(RangeError);
  });
});

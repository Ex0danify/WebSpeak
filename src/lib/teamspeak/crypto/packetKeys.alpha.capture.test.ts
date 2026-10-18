import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fixtureFile, hasCaptures, hasFixture, loadCapture } from "../../../../test/support/tsCaptureFixtures.js";
import { openPacket, parsePacket } from "../transport/packetCodec.js";
import { generationOf, idOf } from "../transport/generationWindow.js";
import { PacketFlag } from "../transport/packetTypes.js";
import { AlphaPacketKeys, DUMMY_PACKET_KEY, DUMMY_PACKET_KEY_256 } from "./packetKeys.js";

const isDummy = (key: Buffer) => key.equals(DUMMY_PACKET_KEY.key) || key.equals(DUMMY_PACKET_KEY_256.key);

describe.skipIf(!hasCaptures || !hasFixture("ts6AlphaKeySchedule.json"))("alpha key schedule against the recorded packets", () => {
  it("reproduces the session key and nonce and decrypts every session packet", () => {
    const sharedIv = Buffer.from(
      (JSON.parse(readFileSync(fixtureFile("ts6AlphaKeySchedule.json")!, "utf8")) as { entries: { sharedIV: string }[] }).entries[0].sharedIV,
      "hex",
    );
    const keys = new AlphaPacketKeys(sharedIv);
    let decrypted = 0;
    for (const packet of loadCapture("ts6AlphaPackets.json").packets) {
      if (packet.flags & PacketFlag.unencrypted || !packet.key || !packet.plain || isDummy(packet.key)) continue;
      const key = keys.keyFor(packet.direction, packet.type, generationOf(packet.packetId), idOf(packet.packetId));
      expect(key.key.equals(packet.key)).toBe(true);
      expect(key.nonce.equals(packet.nonce!)).toBe(true);
      const parsed = parsePacket(packet.direction, packet.raw)!;
      expect(openPacket(parsed, key, undefined)?.equals(packet.plain)).toBe(true);
      decrypted++;
    }
    expect(decrypted).toBeGreaterThan(50);
  });
});

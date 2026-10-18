import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fixtureFile, hasFixture } from "../../../../test/support/tsCaptureFixtures.js";
import { eaxDecrypt, eaxEncrypt } from "./eax.js";
import { DUMMY_PACKET_KEY, DUMMY_PACKET_KEY_256 } from "./packetKeys.js";

// Capture fixtures stay local, CI skips these tests.
const hasFixtures = hasFixture("ts6AlphaPackets.json");

interface CapturedPacket {
  direction: "c2s" | "s2c";
  raw: string;
  keyKind?: string;
  key?: string;
  nonce?: string;
  plain?: string;
}

function encryptedPackets(file: string): Required<CapturedPacket>[] {
  const capture = JSON.parse(readFileSync(fixtureFile(file)!, "utf8")) as { packets: CapturedPacket[] };
  return capture.packets.filter((packet): packet is Required<CapturedPacket> => packet.key !== undefined);
}

describe.skipIf(!hasFixtures)("EAX against the captures", () => {
  for (const [file, kinds] of [
    ["ts3LegacyPackets.json", ["dummy128", "session128"]],
    ["ts6AlphaPackets.json", ["dummy128", "dummy256", "session256"]],
  ] as const) {
    it(`opens and reseals every encrypted packet of ${file}`, () => {
      const packets = encryptedPackets(file);
      expect([...new Set(packets.map((packet) => packet.keyKind))].sort()).toEqual([...kinds].sort());
      for (const packet of packets) {
        const raw = Buffer.from(packet.raw, "hex");
        const header = raw.subarray(8, packet.direction === "c2s" ? 13 : 11);
        const body = raw.subarray(8 + header.length);
        const key = Buffer.from(packet.key, "hex");
        const nonce = Buffer.from(packet.nonce, "hex");
        expect(eaxDecrypt(key, nonce, header, body, raw.subarray(0, 8))?.toString("hex")).toBe(packet.plain);
        const sealed = eaxEncrypt(key, nonce, header, Buffer.from(packet.plain, "hex"));
        expect(Buffer.concat([sealed.tag, header, sealed.ciphertext]).equals(raw)).toBe(true);
      }
    });
  }

  it("uses the dummy keys of packetKeys.ts", () => {
    const packets = [...encryptedPackets("ts3LegacyPackets.json"), ...encryptedPackets("ts6AlphaPackets.json")];
    for (const [kind, dummy] of [
      ["dummy128", DUMMY_PACKET_KEY],
      ["dummy256", DUMMY_PACKET_KEY_256],
    ] as const) {
      const used = packets.filter((packet) => packet.keyKind === kind);
      expect(used.length).toBeGreaterThan(0);
      for (const packet of used) {
        expect(packet.key).toBe(dummy.key.toString("hex"));
        expect(packet.nonce).toBe(dummy.nonce.toString("hex"));
      }
    }
  });
});

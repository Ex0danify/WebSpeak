import { Qlz } from "@echosixhiya/teamspeak-client/transport";
import { describe, expect, it } from "vitest";
import { CAPTURE_FILES, hasCaptures, loadCapture, serverCommandParts } from "../../../../test/support/tsCaptureFixtures.js";
import { encodePacket, openPacket, parsePacket } from "./packetCodec.js";
import { INIT1_MAC, PacketFlag, PacketType } from "./packetTypes.js";
import { decompressQuickLz } from "./quickLz.js";

describe.skipIf(!hasCaptures)("packet codec against the captures", () => {
  for (const file of CAPTURE_FILES) {
    it(`parses, opens and re-encodes every datagram of ${file}`, () => {
      const { packets } = loadCapture(file);
      for (const packet of packets) {
        const parsed = parsePacket(packet.direction, packet.raw)!;
        expect(parsed).toMatchObject({ type: packet.type, flags: packet.flags, id: packet.packetId });
        const key = packet.key && packet.nonce ? { key: packet.key, nonce: packet.nonce } : undefined;
        const payload = openPacket(parsed, key, packet.fakeMac);
        expect(payload).toBeDefined();
        if (packet.plain) expect(payload!.equals(packet.plain)).toBe(true);
        if (packet.type === PacketType.init1) expect(packet.fakeMac!.equals(INIT1_MAC)).toBe(true);
        const fields = { type: parsed.type, flags: parsed.flags, id: parsed.id, clientId: parsed.clientId, payload: payload! };
        expect(encodePacket(packet.direction, fields, key, packet.fakeMac ?? Buffer.alloc(8)).equals(packet.raw)).toBe(true);
      }
    });

    it(`uses one fake MAC for every unencrypted packet of ${file}, in both directions`, () => {
      const macs = new Set(
        loadCapture(file)
          .packets.filter((packet) => packet.type !== PacketType.init1 && packet.flags & PacketFlag.unencrypted)
          .map((packet) => packet.fakeMac!.toString("hex")),
      );
      expect(macs.size).toBe(1);
    });

    it(`decompresses every compressed server command of ${file}`, () => {
      const { packets, messages } = loadCapture(file);
      const parts = serverCommandParts(packets);
      const compressed = messages.filter((message) => message.direction === "s2c" && message.compressed);
      expect(compressed.length).toBeGreaterThan(5);
      for (const message of compressed) {
        const data = Buffer.concat(message.packetIds.map((id) => parts.get(id)!.plain!));
        const text = decompressQuickLz(data);
        expect(text.toString("utf8").startsWith(message.name)).toBe(true);
        // Parity with the pinned SDK, removed together with the SDK.
        expect(Buffer.from(new Qlz().decompress(data)).equals(text)).toBe(true);
      }
    });
  }
});

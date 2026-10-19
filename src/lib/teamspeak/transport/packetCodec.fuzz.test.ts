import { describe, expect, it } from "vitest";
import { forSeeds } from "../../../../test/support/fuzz.js";
import { parsePacket } from "./packetCodec.js";
import { headerBytes, MAC_BYTES, PACKET_TYPE_COUNT } from "./packetTypes.js";

const ITERATIONS = 4000;

// parsePacket splits an untrusted datagram and must stay within its bounds: a result or undefined,
// never a throw, whatever bytes arrive.
describe("packet codec fuzzing", () => {
  for (const direction of ["c2s", "s2c"] as const) {
    it(`parsePacket never throws on ${direction} garbage and keeps its views in bounds`, () => {
      const header = MAC_BYTES + headerBytes(direction);
      forSeeds(ITERATIONS, (fuzz) => {
        const datagram = fuzz.randomBytes(520);
        const packet = parsePacket(direction, datagram);
        if (!packet) {
          const tooShort = datagram.length < header;
          const unknownType = datagram.length >= header && (datagram[header - 1] & 0x0f) >= PACKET_TYPE_COUNT;
          expect(tooShort || unknownType).toBe(true);
          return;
        }
        expect(packet.mac.length).toBe(MAC_BYTES);
        expect(packet.header.length).toBe(headerBytes(direction));
        expect(packet.mac.length + packet.header.length + packet.body.length).toBe(datagram.length);
        expect(packet.type).toBe(datagram[header - 1] & 0x0f);
      });
    });
  }
});

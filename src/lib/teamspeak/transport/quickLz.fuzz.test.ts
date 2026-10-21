import { describe, expect, it } from "vitest";
import { compressQuickLz } from "../../../../test/support/quickLzCompressor.js";
import { forSeeds } from "../../../../test/support/fuzz.js";
import { TeamSpeakTransportError } from "../errors/teamSpeakErrors.js";
import { decompressQuickLz } from "./quickLz.js";

const ITERATIONS = 4000;
const MAX_BYTES = 64 * 1024;

// Decompression runs over attacker-controlled bytes with overlapping back references and a tail
// path: it must always terminate with a Buffer inside the limit or a typed malformedData error.
describe("QuickLZ fuzzing", () => {
  it("never hangs or overruns on arbitrary bytes", () => {
    forSeeds(ITERATIONS, (fuzz) => {
      try {
        const out = decompressQuickLz(fuzz.randomBytes(200), MAX_BYTES);
        expect(out.length).toBeLessThanOrEqual(MAX_BYTES);
      } catch (error) {
        expect(error).toBeInstanceOf(TeamSpeakTransportError);
      }
    });
  });

  it("survives mutations of a valid compressed stream", () => {
    const seed = compressQuickLz(Buffer.from("cid=1 channel_name=Room\\s1|".repeat(40)));
    forSeeds(ITERATIONS, (fuzz) => {
      try {
        const out = decompressQuickLz(fuzz.mutate(seed), MAX_BYTES);
        expect(out.length).toBeLessThanOrEqual(MAX_BYTES);
      } catch (error) {
        expect(error).toBeInstanceOf(TeamSpeakTransportError);
      }
    });
  });
});

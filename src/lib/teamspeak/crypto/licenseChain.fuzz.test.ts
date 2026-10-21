import { describe, expect, it } from "vitest";
import { forSeeds } from "../../../../test/support/fuzz.js";
import { HandshakeError } from "../errors/teamSpeakErrors.js";
import { LicenseBlockType, parseLicenseChain } from "./licenseChain.js";

const ITERATIONS = 4000;
const MAX_INPUT = 300;

function block(type: number, payload: number[]): Buffer {
  const header = Buffer.alloc(42);
  header[33] = type;
  header.writeUInt32BE(100, 34);
  header.writeUInt32BE(200, 38);
  return Buffer.concat([header, Buffer.from(payload)]);
}

// A valid two-block chain to mutate. The parser derives nothing here, so the keys can be any bytes.
const seed = Buffer.concat([
  Buffer.from([1]),
  block(LicenseBlockType.intermediate, [0, 0, 0, 0, ...Buffer.from("Root CA"), 0]),
  block(LicenseBlockType.ephemeral, []),
]);

// The license chain is attacker-controlled bytes with length-prefixed properties and a null
// terminated issuer: parsing must terminate with blocks or a typed HandshakeError, never a hang.
describe("license chain fuzzing", () => {
  it("never hangs or throws an unexpected error on arbitrary bytes", () => {
    forSeeds(ITERATIONS, (fuzz) => {
      try {
        parseLicenseChain(fuzz.randomBytes(MAX_INPUT));
      } catch (error) {
        expect(error).toBeInstanceOf(HandshakeError);
      }
    });
  });

  it("survives mutations of a valid chain", () => {
    forSeeds(ITERATIONS, (fuzz) => {
      try {
        const blocks = parseLicenseChain(fuzz.mutate(seed));
        expect(Array.isArray(blocks)).toBe(true);
      } catch (error) {
        expect(error).toBeInstanceOf(HandshakeError);
      }
    });
  });
});

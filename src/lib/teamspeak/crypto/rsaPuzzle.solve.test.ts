import { Crypt, identityFromString as sdkIdentityFromString } from "@echosixhiya/teamspeak-client/crypto";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { HandshakeError } from "../errors/teamSpeakErrors.js";
import { MAX_PUZZLE_LEVEL, solveRsaPuzzle } from "./rsaPuzzle.js";

const number = (value: bigint) => Buffer.from(value.toString(16).padStart(128, "0"), "hex");

describe("solveRsaPuzzle", () => {
  it("computes x^(2^level) mod n", () => {
    const n = 2n ** 511n - 187n;
    const x = 123456789n;
    let expected = x;
    for (let i = 0; i < 10; i++) expected = (expected * expected) % n;
    expect(solveRsaPuzzle(number(x), number(n), 10).equals(number(expected))).toBe(true);
    expect(solveRsaPuzzle(number(n + 5n), number(n), 0).equals(number(5n))).toBe(true);
  });

  // Parity with the pinned SDK, removed together with the SDK.
  it("answers like the SDK for a random puzzle", () => {
    const x = randomBytes(64);
    const n = randomBytes(64);
    n[0] |= 0x80;
    const crypt = new Crypt(sdkIdentityFromString(`${randomBytes(32).toString("base64")}:0`));
    const sdk = crypt.solveRsaChallenge(Buffer.concat([x, n]), 0, 5000);
    expect(solveRsaPuzzle(x, n, 5000).equals(Buffer.from(sdk))).toBe(true);
  });

  it("rejects bad sizes, levels and moduli", () => {
    const ok = number(97n);
    for (const run of [
      () => solveRsaPuzzle(Buffer.alloc(63), ok, 1),
      () => solveRsaPuzzle(ok, Buffer.alloc(65), 1),
      () => solveRsaPuzzle(ok, ok, -1),
      () => solveRsaPuzzle(ok, ok, 1.5),
      () => solveRsaPuzzle(ok, ok, MAX_PUZZLE_LEVEL + 1),
      () => solveRsaPuzzle(ok, number(1n), 1),
    ]) {
      expect(run).toThrow(HandshakeError);
    }
  });

  it("gives up once the time budget is spent", () => {
    let clock = 0;
    const now = () => (clock += 10);
    expect(() => solveRsaPuzzle(number(3n), number(2n ** 500n + 1n), MAX_PUZZLE_LEVEL, { timeBudgetMs: 50, now })).toThrow(/time budget/);
  });
});

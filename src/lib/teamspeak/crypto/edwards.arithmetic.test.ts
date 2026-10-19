import { ed25519 } from "@noble/curves/ed25519.js";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  clampScalar,
  createEphemeralKey,
  decodePoint,
  encodeFlipped,
  legacySharedSecret,
  multiplyUnreduced,
  scalarFromBytes,
  verifyEd25519,
  type EdPoint,
} from "./edwards.js";

const { BASE, ZERO } = ed25519.Point;
const ORDER = ed25519.Point.CURVE().n;
// (0, -1), the point of order 2.
const ORDER_TWO = decodePoint(Buffer.from(`ec${"ff".repeat(30)}7f`, "hex"));

function naiveMultiply(point: EdPoint, scalar: bigint): EdPoint {
  let result = ZERO;
  for (let addend = point; scalar > 0n; scalar >>= 1n, addend = addend.double()) if (scalar & 1n) result = result.add(addend);
  return result;
}

describe("clampScalar and scalarFromBytes", () => {
  it("clears the low three bits and the top bit and sets bit 254, on a copy", () => {
    const input = Buffer.alloc(32, 0xff);
    const clamped = clampScalar(input);
    expect(clamped[0]).toBe(0xf8);
    expect(clamped[31]).toBe(0x7f);
    expect(clampScalar(Buffer.alloc(32))[31]).toBe(0x40);
    expect(input[0]).toBe(0xff);
    expect(() => clampScalar(Buffer.alloc(31))).toThrow(RangeError);
  });

  it("reads little endian", () => {
    expect(scalarFromBytes(Buffer.from([1, 2]))).toBe(0x0201n);
    expect(scalarFromBytes(Buffer.alloc(0))).toBe(0n);
  });
});

describe("multiplyUnreduced", () => {
  it("keeps the small-order part that a reduced scalar loses", () => {
    expect(multiplyUnreduced(ORDER_TWO, ORDER).equals(ORDER_TWO)).toBe(true);
    const mixed = BASE.add(ORDER_TWO);
    expect(multiplyUnreduced(mixed, ORDER + 1n).equals(BASE)).toBe(true);
    expect(multiplyUnreduced(mixed, 0n).equals(ZERO)).toBe(true);
  });

  it("equals double-and-add for clamped scalars on a point with a small-order part", () => {
    const mixed = BASE.multiply(12345n).add(ORDER_TWO);
    for (let i = 0; i < 5; i++) {
      const scalar = scalarFromBytes(clampScalar(randomBytes(32)));
      expect(scalar > ORDER).toBe(true);
      expect(multiplyUnreduced(mixed, scalar).equals(naiveMultiply(mixed, scalar))).toBe(true);
    }
  });

  it("rejects a negative scalar", () => {
    expect(() => multiplyUnreduced(BASE, -1n)).toThrow(RangeError);
  });
});

describe("legacy key exchange", () => {
  it("derives the public key from the clamped seed", () => {
    const seed = randomBytes(32);
    const { publicKey, privateKey } = createEphemeralKey(seed);
    expect(privateKey.equals(clampScalar(seed))).toBe(true);
    expect(decodePoint(publicKey).equals(naiveMultiply(BASE, scalarFromBytes(privateKey)))).toBe(true);
    expect(createEphemeralKey().publicKey).toHaveLength(32);
  });

  it("rejects keys that are not 32 bytes", () => {
    expect(() => legacySharedSecret(Buffer.alloc(31), Buffer.alloc(32))).toThrow(RangeError);
    expect(() => legacySharedSecret(Buffer.alloc(32), Buffer.alloc(33))).toThrow(RangeError);
  });

  it("flips only the sign bit of the encoding", () => {
    const flipped = encodeFlipped(BASE);
    const plain = Buffer.from(BASE.toBytes());
    expect(flipped[31]).toBe(plain[31] ^ 0x80);
    expect(flipped.subarray(0, 31).equals(plain.subarray(0, 31))).toBe(true);
  });
});

describe("verifyEd25519", () => {
  it("accepts a valid signature and nothing else", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const raw = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url");
    const data = randomBytes(40);
    const signature = sign(null, data, privateKey);
    expect(verifyEd25519(raw, data, signature)).toBe(true);
    expect(verifyEd25519(raw, randomBytes(40), signature)).toBe(false);
    expect(verifyEd25519(Buffer.alloc(31), data, signature)).toBe(false);
  });
});

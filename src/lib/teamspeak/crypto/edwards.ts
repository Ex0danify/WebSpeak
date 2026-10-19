import { ed25519 } from "@noble/curves/ed25519.js";
import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";

// Ed25519 point arithmetic for the license chain and the legacy shared secret. TeamSpeak follows
// NaCl's ge_scalarmult_vartime: scalars are clamped but never reduced mod n, and since the curve has
// cofactor 8, P·s and P·(s mod n) differ when P carries a small-order part.

export type EdPoint = InstanceType<typeof ed25519.Point>;

const POINT_BYTES = 32;
const ORDER = ed25519.Point.CURVE().n;

/** Throws on bytes that are not a point. */
export function decodePoint(bytes: Uint8Array): EdPoint {
  return ed25519.Point.fromBytes(bytes);
}

/** Copy with the Curve25519 clamp applied. */
export function clampScalar(bytes: Uint8Array): Buffer {
  if (bytes.length !== POINT_BYTES) throw new RangeError(`scalar must be ${POINT_BYTES} bytes, got ${bytes.length}`);
  const out = Buffer.from(bytes);
  out[0] &= 0xf8;
  out[31] = (out[31] & 0x7f) | 0x40;
  return out;
}

export function scalarFromBytes(littleEndian: Uint8Array): bigint {
  return BigInt(`0x${Buffer.from(littleEndian).reverse().toString("hex") || "0"}`);
}

/** P·s for any s ≥ 0, keeping the small-order part, as P·(s mod n) + (P·n)·⌊s/n⌋. Variable time. */
export function multiplyUnreduced(point: EdPoint, scalar: bigint): EdPoint {
  if (scalar < 0n) throw new RangeError("scalar must not be negative");
  const quotient = scalar / ORDER;
  const main = point.multiplyUnsafe(scalar % ORDER);
  if (quotient === 0n) return main;
  // multiplyUnsafe stops at n - 1.
  const timesOrder = point.multiplyUnsafe(ORDER - 1n).add(point);
  return main.add(multiplyUnreduced(timesOrder, quotient));
}

/** Point bytes with the sign bit flipped, the encoding TeamSpeak hashes and chains. */
export function encodeFlipped(point: EdPoint): Buffer {
  const bytes = Buffer.from(point.toBytes());
  bytes[31] ^= 0x80;
  return bytes;
}

export interface EphemeralKey {
  publicKey: Buffer;
  /** Clamped scalar, little endian. */
  privateKey: Buffer;
}

/** The `ek` key pair of the legacy handshake. `seed` is for tests, normally 32 random bytes. */
export function createEphemeralKey(seed: Uint8Array = randomBytes(POINT_BYTES)): EphemeralKey {
  const privateKey = clampScalar(seed);
  // The base point has prime order, so reducing is safe here.
  const publicKey = Buffer.from(ed25519.Point.BASE.multiply(scalarFromBytes(privateKey) % ORDER).toBytes());
  return { publicKey, privateKey };
}

/** `SHA512(flip((-serverKey) · s))` with the top bit of the private scalar cleared. */
export function legacySharedSecret(serverPublicKey: Uint8Array, privateKey: Uint8Array): Buffer {
  if (serverPublicKey.length !== POINT_BYTES || privateKey.length !== POINT_BYTES) throw new RangeError("keys must be 32 bytes");
  const scalar = Buffer.from(privateKey);
  scalar[31] &= 0x7f;
  const shared = multiplyUnreduced(decodePoint(serverPublicKey).negate(), scalarFromBytes(scalar));
  return createHash("sha512").update(encodeFlipped(shared)).digest();
}

/** Plain Ed25519 (RFC 8032) verification. False for keys that are not a point. */
export function verifyEd25519(publicKey: Uint8Array, data: Uint8Array, signature: Uint8Array): boolean {
  try {
    const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(publicKey).toString("base64url") }, format: "jwk" });
    return verify(null, data, key, signature);
  } catch {
    return false;
  }
}

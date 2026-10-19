import {
  createECDH,
  createHash,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  generateKeyPairSync,
  type KeyObject,
} from "node:crypto";
import { InvalidIdentityError } from "../errors/teamSpeakErrors.js";
import { decodeTsPublicKey, encodeTsPublicKey, type PublicPoint } from "./identityFormat.js";

const SCALAR_BYTES = 32;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const OFFSET = /^\d{1,40}$/;

/**
 * A TeamSpeak identity: a P-256 key plus the offset that sets its security level. The string form
 * `base64(d):offset` is what browsers store, so it has to stay byte-identical.
 */
export class Identity {
  readonly privateKey: KeyObject;
  readonly offset: bigint;
  /** The public key in TeamSpeak's DER shape, base64. Servers call it omega. */
  readonly publicKeyBase64: string;
  readonly #scalar: Buffer;

  constructor(scalar: Uint8Array, offset: bigint) {
    if (scalar.length !== SCALAR_BYTES) throw new InvalidIdentityError(`the private key must be ${SCALAR_BYTES} bytes`);
    if (offset < 0n) throw new InvalidIdentityError("the offset must not be negative");
    let point: Buffer;
    try {
      const ecdh = createECDH("prime256v1");
      ecdh.setPrivateKey(scalar);
      point = ecdh.getPublicKey();
    } catch (error) {
      throw new InvalidIdentityError("the private key is not a P-256 scalar", { cause: error });
    }
    const x = point.subarray(1, 1 + SCALAR_BYTES);
    const y = point.subarray(1 + SCALAR_BYTES);
    this.#scalar = Buffer.from(scalar);
    this.offset = offset;
    this.privateKey = createPrivateKey({ key: { ...jwkPoint({ x, y }), d: this.#scalar.toString("base64url") }, format: "jwk" });
    this.publicKeyBase64 = encodeTsPublicKey({ x, y }).toString("base64");
  }

  toString(): string {
    return `${this.#scalar.toString("base64")}:${this.offset}`;
  }

  securityLevel(): number {
    return securityLevelOf(this.publicKeyBase64, this.offset);
  }

  withOffset(offset: bigint): Identity {
    return new Identity(this.#scalar, offset);
  }

  /** ECDSA P-256 over SHA-256, DER encoded, as the handshake proofs need it. */
  sign(data: Uint8Array): Buffer {
    return createSign("sha256").update(data).sign(this.privateKey);
  }
}

/** Leading zero bits of `SHA1(omega ‖ offset)`, counted from the low bit of each byte like TeamSpeak does. */
export function securityLevelOf(publicKeyBase64: string, offset: bigint): number {
  return zeroBitsOf(createHash("sha1").update(publicKeyBase64).update(offset.toString()).digest());
}

export function zeroBitsOf(digest: Uint8Array): number {
  const first = digest.findIndex((byte) => byte !== 0);
  if (first < 0) return digest.length * 8;
  let bit = 0;
  while ((digest[first] & (1 << bit)) === 0) bit++;
  return first * 8 + bit;
}

/**
 * Parses `base64(d):offset`. A `d` shorter than 32 bytes is padded at the front, so strings
 * of older tools keep their key.
 */
export function identityFromString(text: string): Identity {
  const colon = text.lastIndexOf(":");
  if (colon < 0) throw new InvalidIdentityError("missing the offset");
  const scalarText = text.slice(0, colon);
  const offsetText = text.slice(colon + 1);
  if (!BASE64.test(scalarText)) throw new InvalidIdentityError("the private key is not base64");
  if (!OFFSET.test(offsetText)) throw new InvalidIdentityError("the offset is not a decimal number");
  const scalar = Buffer.from(scalarText, "base64");
  if (scalar.length > SCALAR_BYTES) throw new InvalidIdentityError("the private key is too long");
  const padded = Buffer.alloc(SCALAR_BYTES);
  scalar.copy(padded, SCALAR_BYTES - scalar.length);
  return new Identity(padded, BigInt(offsetText));
}

/** A new random key at offset 0. */
export function createIdentityKey(): Identity {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const d = privateKey.export({ format: "jwk" }).d!;
  const raw = Buffer.from(d, "base64url");
  const scalar = Buffer.alloc(SCALAR_BYTES);
  raw.copy(scalar, SCALAR_BYTES - raw.length);
  return new Identity(scalar, 0n);
}

/** Lowest offset from `start` on that reaches `level`. */
export function findOffset(publicKeyBase64: string, start: bigint, level: number): bigint {
  let offset = start;
  while (securityLevelOf(publicKeyBase64, offset) < level) offset++;
  return offset;
}

/** Blocks the thread, fine for the low levels a guest needs. Higher levels belong in identityWorker.ts. */
export function generateIdentity(level: number): Identity {
  const identity = createIdentityKey();
  return identity.withOffset(findOffset(identity.publicKeyBase64, 0n, level));
}

function jwkPoint(point: PublicPoint) {
  return { kty: "EC", crv: "P-256", x: point.x.toString("base64url"), y: point.y.toString("base64url") };
}

/** A server's or client's omega as a key, undefined when it is malformed or not on the curve. */
export function importTsPublicKey(publicKeyBase64: string): KeyObject | undefined {
  if (!BASE64.test(publicKeyBase64)) return undefined;
  const point = decodeTsPublicKey(Buffer.from(publicKeyBase64, "base64"));
  if (!point) return undefined;
  try {
    return createPublicKey({ key: jwkPoint(point), format: "jwk" });
  } catch {
    return undefined;
  }
}

/** Malformed signatures verify as false, they do not throw. */
export function verifyTsSignature(publicKey: KeyObject, data: Uint8Array, signature: Uint8Array): boolean {
  return createVerify("sha256").update(data).verify(publicKey, signature);
}

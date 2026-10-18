import { createHash } from "node:crypto";

export type PacketDirection = "c2s" | "s2c";

/** Key and nonce for one packet. Shared instances, callers must not modify them. */
export interface PacketKey {
  key: Buffer;
  nonce: Buffer;
}

// Both sides use these before the session key exists. The 256-bit pair is the TS6 alpha
// handshake.
export const DUMMY_PACKET_KEY: PacketKey = {
  key: Buffer.from("c:\\windows\\syste"),
  nonce: Buffer.from("m\\firewall32.cpl"),
};
export const DUMMY_PACKET_KEY_256: PacketKey = {
  key: Buffer.from("c:\\windows\\system\\firewall32.cpl"),
  nonce: Buffer.from(";c:\\windows\\system32\\firewallapi"),
};

export interface PacketKeySchedule {
  keyFor(direction: PacketDirection, packetType: number, generation: number, packetId: number): PacketKey;
}

const ALPHA_BYTES = 10;
const FAKE_MAC_BYTES = 8;

/** The legacy `ivStruct`: shared secret XOR `alpha ‖ beta`. */
export function deriveIvStruct(alpha: Uint8Array, beta: Uint8Array, sharedSecret: Uint8Array): Buffer {
  if (alpha.length !== ALPHA_BYTES) throw new RangeError(`alpha must be ${ALPHA_BYTES} bytes, got ${alpha.length}`);
  if (sharedSecret.length < ALPHA_BYTES + beta.length) throw new RangeError("shared secret is shorter than alpha and beta");
  const iv = Buffer.allocUnsafe(ALPHA_BYTES + beta.length);
  for (let i = 0; i < ALPHA_BYTES; i++) iv[i] = sharedSecret[i] ^ alpha[i];
  for (let i = 0; i < beta.length; i++) iv[ALPHA_BYTES + i] = sharedSecret[ALPHA_BYTES + i] ^ beta[i];
  return iv;
}

/** MAC of unencrypted packets (ping, pong, late acks) once the legacy handshake is through. */
export function legacyFakeMac(ivStruct: Uint8Array): Buffer {
  return createHash("sha1").update(ivStruct).digest().subarray(0, FAKE_MAC_BYTES);
}

// A generation lasts 65536 packets, so a handful of entries covers every live (direction, type, generation).
const CACHE_LIMIT = 64;

/**
 * `hash(dir ‖ type ‖ generation u32be ‖ iv)` split into a key and a nonce, then the packet id XORed
 * into the first two key bytes. The hash and the key length pick the AES variant: SHA-256 → AES-128,
 * SHA-512 → AES-256.
 */
abstract class HashPacketKeys implements PacketKeySchedule {
  protected abstract readonly algorithm: "sha256" | "sha512";
  protected abstract readonly keyBytes: number;
  readonly #iv: Buffer;
  readonly #cache = new Map<number, PacketKey>();

  constructor(iv: Uint8Array) {
    this.#iv = Buffer.from(iv);
  }

  keyFor(direction: PacketDirection, packetType: number, generation: number, packetId: number): PacketKey {
    const base = this.#base(direction, packetType & 0x0f, generation >>> 0);
    const key = Buffer.from(base.key);
    key[0] ^= (packetId >> 8) & 0xff;
    key[1] ^= packetId & 0xff;
    return { key, nonce: base.nonce };
  }

  #base(direction: PacketDirection, packetType: number, generation: number): PacketKey {
    const id = ((direction === "s2c" ? 0x10 : 0) | packetType) * 0x1_0000_0000 + generation;
    const cached = this.#cache.get(id);
    if (cached) return cached;
    const input = Buffer.allocUnsafe(6 + this.#iv.length);
    input[0] = direction === "s2c" ? 0x30 : 0x31;
    input[1] = packetType;
    input.writeUInt32BE(generation, 2);
    this.#iv.copy(input, 6);
    const hash = createHash(this.algorithm).update(input).digest();
    const entry = { key: hash.subarray(0, this.keyBytes), nonce: hash.subarray(this.keyBytes, this.keyBytes * 2) };
    if (this.#cache.size >= CACHE_LIMIT) this.#cache.clear();
    this.#cache.set(id, entry);
    return entry;
  }
}

/** Legacy schedule: SHA-256 over the `ivStruct`, AES-128 keys. */
export class LegacyPacketKeys extends HashPacketKeys {
  protected readonly algorithm = "sha256";
  protected readonly keyBytes = 16;
}

/** TS6 alpha schedule: SHA-512 over the `sharedIv`, AES-256 keys. */
export class AlphaPacketKeys extends HashPacketKeys {
  protected readonly algorithm = "sha512";
  protected readonly keyBytes = 32;
}

export interface AlphaSecrets {
  /** The 64-byte IV that feeds the per-packet schedule. */
  sharedIv: Buffer;
  /** MAC of unencrypted packets once the alpha handshake is through. */
  fakeMac: Buffer;
}

/**
 * Derives the connection secrets of the TS6 alpha handshake from the X25519 secret and the two
 * handshake nonces. `h = SHA512(SHA256(ecdh))` splits into two halves that key the IV and the MAC;
 * `SHA256(alpha)` and `beta` mix in the per-session nonces.
 */
export function alphaSecrets(ecdh: Uint8Array, alpha: Uint8Array, beta: Uint8Array): AlphaSecrets {
  const h = createHash("sha512").update(createHash("sha256").update(ecdh).digest()).digest();
  const y = createHash("sha256").update(alpha).digest();
  const sharedIv = createHash("sha512").update(Buffer.concat([h.subarray(0, 32), y, beta])).digest();
  const aux = createHash("sha256").update(Buffer.concat([h.subarray(32, 64), y, beta])).digest();
  return { sharedIv, fakeMac: aux.subarray(0, FAKE_MAC_BYTES) };
}

import { x25519 } from "@noble/curves/ed25519.js";
import { randomBytes } from "node:crypto";

// Curve25519 ECDH for the TS6 handshake. The scalar is clamped inside noble, so any 32 bytes
// are a valid private key.

const KEY_BYTES = 32;

export interface X25519Key {
  publicKey: Buffer;
  privateKey: Buffer;
}

/** Ephemeral key pair. `seed` is for tests, normally 32 random bytes. */
export function createX25519Key(seed: Uint8Array = randomBytes(KEY_BYTES)): X25519Key {
  if (seed.length !== KEY_BYTES) throw new RangeError(`seed must be ${KEY_BYTES} bytes, got ${seed.length}`);
  const privateKey = Buffer.from(seed);
  return { privateKey, publicKey: Buffer.from(x25519.getPublicKey(privateKey)) };
}

/** The shared point `privateKey · peerPublicKey`, the input to the key derivation. */
export function x25519SharedSecret(privateKey: Uint8Array, peerPublicKey: Uint8Array): Buffer {
  if (privateKey.length !== KEY_BYTES || peerPublicKey.length !== KEY_BYTES) throw new RangeError("keys must be 32 bytes");
  return Buffer.from(x25519.getSharedSecret(privateKey, peerPublicKey));
}

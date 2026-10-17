import { createCipheriv, timingSafeEqual } from "node:crypto";

// EAX (Bellare, Rogaway, Wagner) over AES-128 or AES-256, the key length picks the variant.
// TeamSpeak truncates the tag to 8 bytes.

const BLOCK = 16;
export const EAX_TAG_BYTES = 8;

export interface EaxSealed {
  ciphertext: Buffer;
  tag: Buffer;
}

function aesName(key: Uint8Array, mode: "cbc" | "ctr"): string {
  if (key.length === 16) return `aes-128-${mode}`;
  if (key.length === 32) return `aes-256-${mode}`;
  throw new RangeError(`AES key must be 16 or 32 bytes, got ${key.length}`);
}

const ZERO_IV = Buffer.alloc(BLOCK);

/** Doubling in GF(2^128), the subkey step of RFC 4493. */
function double(block: Buffer): Buffer {
  const out = Buffer.allocUnsafe(BLOCK);
  let carry = 0;
  for (let i = BLOCK - 1; i >= 0; i--) {
    out[i] = ((block[i] << 1) | carry) & 0xff;
    carry = block[i] >> 7;
  }
  if (block[0] & 0x80) out[BLOCK - 1] ^= 0x87;
  return out;
}

class Omac {
  readonly #key: Uint8Array;
  readonly #k1: Buffer;
  readonly #k2: Buffer;

  constructor(key: Uint8Array) {
    this.#key = key;
    const l = createCipheriv(aesName(key, "cbc"), key, ZERO_IV).update(ZERO_IV);
    this.#k1 = double(l);
    this.#k2 = double(this.#k1);
  }

  /** CMAC of `prefix ‖ data`, prefix being one optional leading block (EAX's [t]_n). */
  mac(data: Uint8Array, prefix?: Buffer): Buffer {
    const total = (prefix ? BLOCK : 0) + data.length;
    const complete = total > 0 && total % BLOCK === 0;
    const padded = complete ? total : total - (total % BLOCK) + BLOCK;
    const message = Buffer.alloc(padded);
    if (prefix) prefix.copy(message);
    message.set(data, prefix ? BLOCK : 0);
    if (!complete) message[total] = 0x80;
    const subkey = complete ? this.#k1 : this.#k2;
    const last = padded - BLOCK;
    for (let i = 0; i < BLOCK; i++) message[last + i] ^= subkey[i];
    // CBC-MAC with a zero IV, the last cipher block is the MAC.
    const chain = createCipheriv(aesName(this.#key, "cbc"), this.#key, ZERO_IV).update(message);
    return chain.subarray(chain.length - BLOCK);
  }
}

/** AES-CMAC (RFC 4493, NIST SP 800-38B). */
export function aesCmac(key: Uint8Array, message: Uint8Array): Buffer {
  return new Omac(key).mac(message);
}

const DOMAIN = [0, 1, 2].map((t) => {
  const block = Buffer.alloc(BLOCK);
  block[BLOCK - 1] = t;
  return block;
});

function eaxParts(key: Uint8Array, nonce: Uint8Array, header: Uint8Array) {
  const omac = new Omac(key);
  return { omac, nTag: omac.mac(nonce, DOMAIN[0]), hTag: omac.mac(header, DOMAIN[1]) };
}

function ctr(key: Uint8Array, counter: Buffer, data: Uint8Array): Buffer {
  return createCipheriv(aesName(key, "ctr"), key, counter).update(data);
}

function combineTag(nTag: Buffer, hTag: Buffer, cTag: Buffer, length: number): Buffer {
  const tag = Buffer.allocUnsafe(length);
  for (let i = 0; i < length; i++) tag[i] = nTag[i] ^ hTag[i] ^ cTag[i];
  return tag;
}

export function eaxEncrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  header: Uint8Array,
  plaintext: Uint8Array,
  tagLength = EAX_TAG_BYTES,
): EaxSealed {
  if (tagLength < 1 || tagLength > BLOCK) throw new RangeError(`EAX tag length must be 1 to 16, got ${tagLength}`);
  const { omac, nTag, hTag } = eaxParts(key, nonce, header);
  const ciphertext = ctr(key, nTag, plaintext);
  return { ciphertext, tag: combineTag(nTag, hTag, omac.mac(ciphertext, DOMAIN[2]), tagLength) };
}

/** Plaintext, or undefined when the tag does not match. Never throws on bad data, garbage packets stay cheap. */
export function eaxDecrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  header: Uint8Array,
  ciphertext: Uint8Array,
  tag: Uint8Array,
): Buffer | undefined {
  if (tag.length < 1 || tag.length > BLOCK) return undefined;
  const { omac, nTag, hTag } = eaxParts(key, nonce, header);
  const expected = combineTag(nTag, hTag, omac.mac(ciphertext, DOMAIN[2]), tag.length);
  if (!timingSafeEqual(expected, tag)) return undefined;
  return ctr(key, nTag, ciphertext);
}

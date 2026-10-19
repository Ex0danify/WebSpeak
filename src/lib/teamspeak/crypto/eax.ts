import { type Cipher, createCipheriv, timingSafeEqual } from "node:crypto";

// EAX (Bellare, Rogaway, Wagner) over AES-128 or AES-256, the key length picks the variant.
// TeamSpeak truncates the tag to 8 bytes.
//
// Every packet has its own key, so setting up a cipher is the expensive part. All block cipher
// calls go through one ECB context; only a data OMAC longer than two blocks gets a CBC context.

const BLOCK = 16;
export const EAX_TAG_BYTES = 8;
// Up to this many blocks a CBC-MAC chain is cheaper as single ECB calls than as a new CBC context.
const ECB_CHAIN_BLOCKS = 2;

export interface EaxSealed {
  ciphertext: Buffer;
  tag: Buffer;
}

function aesName(key: Uint8Array, mode: "cbc" | "ecb"): string {
  if (key.length === 16) return `aes-128-${mode}`;
  if (key.length === 32) return `aes-256-${mode}`;
  throw new RangeError(`AES key must be 16 or 32 bytes, got ${key.length}`);
}

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

// The zero block gives L for the subkeys and is EAX's [0]_n too, then [1]_n and [2]_n.
const DOMAIN_BLOCKS = Buffer.alloc(3 * BLOCK);
DOMAIN_BLOCKS[2 * BLOCK - 1] = 1;
DOMAIN_BLOCKS[3 * BLOCK - 1] = 2;
const ZERO_BLOCK = Buffer.alloc(BLOCK);

/** A CBC-MAC still to run: `message` is padded and has the subkey in its last block. */
interface MacChain {
  state: Buffer;
  message: Buffer;
}

class Omac {
  readonly #key: Uint8Array;
  readonly #ecb: Cipher;
  readonly #k1: Buffer;
  readonly #k2: Buffer;
  /** E([t]_n) for t = 0, 1, 2. */
  readonly #domains: Buffer[];

  constructor(key: Uint8Array) {
    this.#key = key;
    this.#ecb = createCipheriv(aesName(key, "ecb"), key, null).setAutoPadding(false);
    const encrypted = this.#ecb.update(DOMAIN_BLOCKS);
    this.#domains = [0, 1, 2].map((t) => encrypted.subarray(t * BLOCK, (t + 1) * BLOCK));
    this.#k1 = double(this.#domains[0]);
    this.#k2 = double(this.#k1);
  }

  encryptBlocks(blocks: Buffer): Buffer {
    return this.#ecb.update(blocks);
  }

  /** CMAC of `data` alone. */
  plain(data: Uint8Array): MacChain {
    return { state: ZERO_BLOCK, message: this.#finish(data) };
  }

  /** CMAC of `[t]_n ‖ data`. The first block is already encrypted, so the chain starts after it. */
  tagged(t: number, data: Uint8Array): MacChain {
    // [t]_n alone is one complete block and takes K1.
    if (data.length === 0) return { state: ZERO_BLOCK, message: xorBlock(DOMAIN_BLOCKS.subarray(t * BLOCK, (t + 1) * BLOCK), this.#k1) };
    return { state: this.#domains[t], message: this.#finish(data) };
  }

  /** Runs the chains side by side, one ECB call per block position. Short chains only. */
  runShort(chains: MacChain[]): Buffer[] {
    const states: Buffer[] = [];
    let steps = 0;
    for (const chain of chains) {
      states.push(chain.state);
      steps = Math.max(steps, chain.message.length / BLOCK);
    }
    for (let step = 0, offset = 0; step < steps; step++, offset += BLOCK) {
      let active = 0;
      for (const chain of chains) if (chain.message.length > offset) active++;
      const input = Buffer.allocUnsafe(active * BLOCK);
      for (let i = 0, at = 0; i < chains.length; i++) {
        const { message } = chains[i];
        if (message.length <= offset) continue;
        const state = states[i];
        for (let b = 0; b < BLOCK; b++) input[at + b] = state[b] ^ message[offset + b];
        at += BLOCK;
      }
      const output = this.encryptBlocks(input);
      for (let i = 0, at = 0; i < chains.length; i++) {
        if (chains[i].message.length <= offset) continue;
        states[i] = output.subarray(at, at + BLOCK);
        at += BLOCK;
      }
    }
    return states;
  }

  run(chain: MacChain): Buffer {
    if (this.isShort(chain)) return this.runShort([chain])[0];
    const out = createCipheriv(aesName(this.#key, "cbc"), this.#key, chain.state).setAutoPadding(false).update(chain.message);
    return out.subarray(out.length - BLOCK);
  }

  isShort(chain: MacChain): boolean {
    return chain.message.length <= ECB_CHAIN_BLOCKS * BLOCK;
  }

  #finish(data: Uint8Array): Buffer {
    const total = data.length;
    const complete = total > 0 && total % BLOCK === 0;
    const padded = complete ? total : total - (total % BLOCK) + BLOCK;
    const message = Buffer.alloc(padded);
    message.set(data);
    if (!complete) message[total] = 0x80;
    const subkey = complete ? this.#k1 : this.#k2;
    const last = padded - BLOCK;
    for (let i = 0; i < BLOCK; i++) message[last + i] ^= subkey[i];
    return message;
  }
}

function xorBlock(a: Buffer, b: Buffer): Buffer {
  const out = Buffer.allocUnsafe(BLOCK);
  for (let i = 0; i < BLOCK; i++) out[i] = a[i] ^ b[i];
  return out;
}

/** AES-CMAC (RFC 4493, NIST SP 800-38B). */
export function aesCmac(key: Uint8Array, message: Uint8Array): Buffer {
  const omac = new Omac(key);
  return omac.run(omac.plain(message));
}

/** CTR with the full 128-bit counter, big endian, like OpenSSL. */
function ctr(omac: Omac, counter: Buffer, data: Uint8Array): Buffer {
  if (data.length === 0) return Buffer.alloc(0);
  const blocks = Math.ceil(data.length / BLOCK);
  const counters = Buffer.allocUnsafe(blocks * BLOCK);
  const next = Buffer.from(counter);
  for (let block = 0; block < blocks; block++) {
    next.copy(counters, block * BLOCK);
    for (let i = BLOCK - 1; i >= 0; i--) {
      next[i] = (next[i] + 1) & 0xff;
      if (next[i] !== 0) break;
    }
  }
  const stream = omac.encryptBlocks(counters);
  const out = Buffer.allocUnsafe(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ stream[i];
  return out;
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
  const omac = new Omac(key);
  const [nTag, hTag] = omac.runShort([omac.tagged(0, nonce), omac.tagged(1, header)]);
  const ciphertext = ctr(omac, nTag, plaintext);
  return { ciphertext, tag: combineTag(nTag, hTag, omac.run(omac.tagged(2, ciphertext)), tagLength) };
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
  const omac = new Omac(key);
  const chains = [omac.tagged(0, nonce), omac.tagged(1, header)];
  const data = omac.tagged(2, ciphertext);
  // A short ciphertext MAC rides along with the other two.
  const short = omac.isShort(data);
  const [nTag, hTag, shortTag] = omac.runShort(short ? [...chains, data] : chains);
  const cTag = short ? shortTag : omac.run(data);
  const expected = combineTag(nTag, hTag, cTag, tag.length);
  if (!timingSafeEqual(expected, tag)) return undefined;
  return ctr(omac, nTag, ciphertext);
}

// A seeded fuzzer for the own TeamSpeak client's parsers: deterministic bytes, strings and mutation
// of seed inputs, so a failure reproduces from its seed. mulberry32 comes from the link simulator.
import { seededRandom } from "./tsLinkSimulator.js";

/** Characters a command parser has to survive: separators, escapes, control bytes and some unicode. */
// Code points kept numeric so the source stays ASCII (gateway literal budget): accented latin, euro
// sign, a musical astral symbol and a CJK ideograph.
const STRING_CHARSET = [
  ..." =|\\/-\x00\x07\b\f\n\r\t\v",
  ..."abcABC0129_",
  ...[0xe9, 0x20ac, 0x1d11e, 0x4e2d].map((code) => String.fromCodePoint(code)),
];

export class Fuzzer {
  readonly #rng: () => number;

  constructor(seed: number) {
    this.#rng = seededRandom(seed);
  }

  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number {
    return Math.floor(this.#rng() * maxExclusive);
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }

  chance(probability: number): boolean {
    return this.#rng() < probability;
  }

  bytes(length: number): Buffer {
    const out = Buffer.allocUnsafe(length);
    for (let i = 0; i < length; i++) out[i] = this.int(256);
    return out;
  }

  randomBytes(maxLength: number): Buffer {
    return this.bytes(this.int(maxLength + 1));
  }

  string(maxLength: number): string {
    let text = "";
    for (let length = this.int(maxLength + 1); length > 0; length--) text += this.pick(STRING_CHARSET);
    return text;
  }

  /** A byte mutation of a seed: flip, insert, delete, truncate or duplicate a region. */
  mutate(seed: Uint8Array): Buffer {
    const data = Buffer.from(seed);
    switch (this.int(5)) {
      case 0: {
        if (data.length === 0) return data;
        data[this.int(data.length)] ^= 1 << this.int(8);
        return data;
      }
      case 1: {
        const at = this.int(data.length + 1);
        return Buffer.concat([data.subarray(0, at), this.bytes(1 + this.int(8)), data.subarray(at)]);
      }
      case 2: {
        if (data.length === 0) return data;
        const at = this.int(data.length);
        return Buffer.concat([data.subarray(0, at), data.subarray(at + 1)]);
      }
      case 3:
        return data.subarray(0, this.int(data.length + 1));
      default: {
        if (data.length === 0) return data;
        const start = this.int(data.length);
        const end = start + 1 + this.int(data.length - start);
        return Buffer.concat([data.subarray(0, end), data.subarray(start, end), data.subarray(end)]);
      }
    }
  }
}

/** Runs `body` for seeds 0..iterations-1, naming the seed in any failure so it reproduces. */
export function forSeeds(iterations: number, body: (fuzz: Fuzzer, seed: number) => void): void {
  for (let seed = 0; seed < iterations; seed++) {
    try {
      body(new Fuzzer(seed), seed);
    } catch (error) {
      throw new Error(`fuzz seed ${seed} failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }
}

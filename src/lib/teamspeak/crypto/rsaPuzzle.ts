import { HandshakeError } from "../errors/teamSpeakErrors.js";

// Init1 step 3 asks for y = x^(2^level) mod n, with x and n as 64-byte big-endian numbers.
// Squaring is the only way, so a server could make us spin with a huge level: both the level and
// the time spent are capped.

const NUMBER_BYTES = 64;
export const MAX_PUZZLE_LEVEL = 1_000_000;
const CHECK_EVERY = 1024;

export interface RsaPuzzleOptions {
  /** Default 10 s. */
  timeBudgetMs?: number;
  now?: () => number;
}

const toBigInt = (bytes: Uint8Array) => BigInt(`0x${Buffer.from(bytes).toString("hex")}`);

export function solveRsaPuzzle(x: Uint8Array, n: Uint8Array, level: number, options: RsaPuzzleOptions = {}): Buffer {
  if (x.length !== NUMBER_BYTES || n.length !== NUMBER_BYTES)
    throw new HandshakeError("init1", `puzzle numbers must be ${NUMBER_BYTES} bytes`);
  if (!Number.isInteger(level) || level < 0 || level > MAX_PUZZLE_LEVEL)
    throw new HandshakeError("init1", `puzzle level ${level} is out of range`);
  const modulus = toBigInt(n);
  if (modulus < 2n) throw new HandshakeError("init1", "puzzle modulus is below 2");
  const { timeBudgetMs = 10_000, now = Date.now } = options;
  const deadline = now() + timeBudgetMs;
  let y = toBigInt(x) % modulus;
  for (let i = 0; i < level; i++) {
    y = (y * y) % modulus;
    if (i % CHECK_EVERY === CHECK_EVERY - 1 && now() > deadline)
      throw new HandshakeError("init1", "puzzle took longer than its time budget");
  }
  return Buffer.from(y.toString(16).padStart(NUMBER_BYTES * 2, "0"), "hex");
}

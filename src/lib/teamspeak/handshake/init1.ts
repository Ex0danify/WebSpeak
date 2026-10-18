import { solveRsaPuzzle, type RsaPuzzleOptions } from "../crypto/rsaPuzzle.js";

// Init1 runs before any key exists. The client starts with step 0, the server answers 1 and 3, the
// client 2 and 4. Client steps start with the init version, server steps with the step number.
// Step 4 carries the puzzle solution and the `clientinitiv` command text.

/** The version the client announces in Init1, a TS3 3.5.0 build. The probe sends it too. */
export const INIT_VERSION = 1566914096;

export const Init1Step = { start: 0, cookie: 1, cookieEcho: 2, puzzle: 3, solution: 4, restart: 0x7f } as const;

const VERSION_BYTES = 4;
const RANDOM_BYTES = 4;
const COOKIE_BYTES = 16;
const NUMBER_BYTES = 64;
const SERVER_DATA_BYTES = 100;
/** x, n, level and the server data, echoed in step 4. */
const PUZZLE_BYTES = 2 * NUMBER_BYTES + 4 + SERVER_DATA_BYTES;
const COOKIE_STEP_BYTES = 1 + COOKIE_BYTES + RANDOM_BYTES;
const PUZZLE_STEP_BYTES = 1 + PUZZLE_BYTES;

function clientStep(step: number, length: number): Buffer {
  const payload = Buffer.alloc(VERSION_BYTES + 1 + length);
  payload.writeUInt32BE(INIT_VERSION, 0);
  payload[VERSION_BYTES] = step;
  return payload;
}

/** Step 0: the time in seconds and four random bytes, eight reserved zero bytes. */
export function init1Start(unixSeconds: number, random: Uint8Array): Buffer {
  if (random.length !== RANDOM_BYTES) throw new RangeError(`Init1 random must be ${RANDOM_BYTES} bytes`);
  const payload = clientStep(Init1Step.start, 4 + RANDOM_BYTES + 8);
  payload.writeUInt32BE(Math.max(0, Math.min(Math.floor(unixSeconds), 0xffff_ffff)), VERSION_BYTES + 1);
  payload.set(random, VERSION_BYTES + 5);
  return payload;
}

export interface Init1Context {
  /** The random bytes of step 0, the server echoes them in reverse. */
  random: Uint8Array;
  clientInitIv: Uint8Array;
  puzzle?: RsaPuzzleOptions;
}

export type Init1Answer = { kind: "send"; payload: Buffer } | { kind: "restart" } | { kind: "ignore" };

/**
 * The client's answer to a server step. Packets of the wrong length, stale cookies and unknown
 * steps are ignored, the resend of the previous step keeps the exchange going.
 */
export function answerInit1(server: Buffer, context: Init1Context): Init1Answer {
  switch (server[0]) {
    case Init1Step.cookie: {
      if (server.length !== COOKIE_STEP_BYTES) return { kind: "ignore" };
      const echo = server.subarray(1 + COOKIE_BYTES);
      if (!echo.equals(Buffer.from(context.random).reverse())) return { kind: "ignore" };
      const payload = clientStep(Init1Step.cookieEcho, COOKIE_BYTES + RANDOM_BYTES);
      server.copy(payload, VERSION_BYTES + 1, 1);
      return { kind: "send", payload };
    }
    case Init1Step.puzzle: {
      if (server.length !== PUZZLE_STEP_BYTES) return { kind: "ignore" };
      const x = server.subarray(1, 1 + NUMBER_BYTES);
      const n = server.subarray(1 + NUMBER_BYTES, 1 + 2 * NUMBER_BYTES);
      const level = server.readUInt32BE(1 + 2 * NUMBER_BYTES);
      const y = solveRsaPuzzle(x, n, level, context.puzzle);
      const payload = clientStep(Init1Step.solution, PUZZLE_BYTES + NUMBER_BYTES + context.clientInitIv.length);
      server.copy(payload, VERSION_BYTES + 1, 1);
      y.copy(payload, VERSION_BYTES + 1 + PUZZLE_BYTES);
      payload.set(context.clientInitIv, VERSION_BYTES + 1 + PUZZLE_BYTES + NUMBER_BYTES);
      return { kind: "send", payload };
    }
    case Init1Step.restart:
      return { kind: "restart" };
    default:
      return { kind: "ignore" };
  }
}

export const INIT1_LAYOUT = { VERSION_BYTES, COOKIE_BYTES, NUMBER_BYTES, PUZZLE_BYTES } as const;

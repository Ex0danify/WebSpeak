import { describe, expect, it } from "vitest";
import { solveRsaPuzzle } from "../crypto/rsaPuzzle.js";
import { answerInit1, INIT_VERSION, init1Start, Init1Step } from "./init1.js";

const random = Buffer.from([1, 2, 3, 4]);
const clientInitIv = Buffer.from("clientinitiv alpha=AAAAAAAAAAAAAA== omega=x ot=1 ip=");
const context = { random, clientInitIv };

const cookieStep = (echo: Uint8Array = Buffer.from(random).reverse()) =>
  Buffer.concat([Buffer.from([Init1Step.cookie]), Buffer.alloc(16, 0xc0), echo]);

function puzzleStep(level: number): Buffer {
  const step = Buffer.alloc(233, 0x22);
  step[0] = Init1Step.puzzle;
  step.fill(0x35, 1, 65);
  step.fill(0xa7, 65, 129);
  step.writeUInt32BE(level, 129);
  return step;
}

describe("Init1 client steps", () => {
  it("starts with the version, step 0, the time, the random bytes and eight zero bytes", () => {
    const start = init1Start(1_792_222_195.7, random);
    expect(start).toHaveLength(21);
    expect(start.readUInt32BE(0)).toBe(INIT_VERSION);
    expect(start[4]).toBe(0);
    expect(start.readUInt32BE(5)).toBe(1_792_222_195);
    expect(start.subarray(9, 13)).toEqual(random);
    expect(start.subarray(13)).toEqual(Buffer.alloc(8));
    expect(init1Start(-5, random).readUInt32BE(5)).toBe(0);
    expect(init1Start(2 ** 40, random).readUInt32BE(5)).toBe(0xffff_ffff);
    expect(() => init1Start(0, Buffer.alloc(3))).toThrow(RangeError);
  });

  it("echoes the cookie and the reversed random bytes in step 2", () => {
    const answer = answerInit1(cookieStep(), context);
    expect(answer.kind).toBe("send");
    const payload = (answer as { payload: Buffer }).payload;
    expect(payload).toHaveLength(25);
    expect(payload.readUInt32BE(0)).toBe(INIT_VERSION);
    expect(payload[4]).toBe(Init1Step.cookieEcho);
    expect(payload.subarray(5)).toEqual(cookieStep().subarray(1));
  });

  it("ignores a cookie for other random bytes or of the wrong length", () => {
    expect(answerInit1(cookieStep(Buffer.from([9, 9, 9, 9])), context)).toEqual({ kind: "ignore" });
    expect(answerInit1(cookieStep().subarray(0, 20), context)).toEqual({ kind: "ignore" });
  });

  it("solves the puzzle in step 4 and appends clientinitiv", () => {
    const step = puzzleStep(100);
    const answer = answerInit1(step, context) as { kind: "send"; payload: Buffer };
    expect(answer.kind).toBe("send");
    const { payload } = answer;
    expect(payload[4]).toBe(Init1Step.solution);
    expect(payload.subarray(5, 237)).toEqual(step.subarray(1));
    expect(payload.subarray(237, 301)).toEqual(solveRsaPuzzle(step.subarray(1, 65), step.subarray(65, 129), 100));
    expect(payload.subarray(301)).toEqual(clientInitIv);
  });

  it("ignores a puzzle of the wrong length and unknown steps, restarts on request", () => {
    expect(answerInit1(puzzleStep(1).subarray(0, 200), context)).toEqual({ kind: "ignore" });
    expect(answerInit1(Buffer.from([9, 0, 0]), context)).toEqual({ kind: "ignore" });
    expect(answerInit1(Buffer.alloc(0), context)).toEqual({ kind: "ignore" });
    expect(answerInit1(Buffer.from([Init1Step.restart]), context)).toEqual({ kind: "restart" });
  });

  it("passes the puzzle guard on, a level out of range is a HandshakeError", () => {
    expect(() => answerInit1(puzzleStep(2_000_000), context)).toThrow(/level 2000000 is out of range/);
  });
});

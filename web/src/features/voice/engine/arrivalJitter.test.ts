import { describe, expect, it } from "vitest";
import { createArrivalJitter } from "@/features/voice/engine/arrivalJitter";

function feed(jitter: ReturnType<typeof createArrivalJitter>, clientId: number, gaps: number[], start = 0): number {
  let at = start;
  jitter.frame(clientId, at);
  for (const gap of gaps) {
    at += gap;
    jitter.frame(clientId, at);
  }
  return at;
}

describe("createArrivalJitter", () => {
  it("stays near zero for frames on a steady 20 ms beat", () => {
    const jitter = createArrivalJitter();
    const end = feed(jitter, 1, Array(50).fill(20));
    expect(jitter.snapshot(end).jitterMs).toBe(0);
  });

  it("rises when frames arrive unevenly", () => {
    const jitter = createArrivalJitter();
    const end = feed(jitter, 1, [5, 35, 5, 35, 5, 35, 5, 35, 5, 35, 5, 35]);
    expect(jitter.snapshot(end).jitterMs).toBeGreaterThan(3);
  });

  it("does not count a pause between sentences", () => {
    const jitter = createArrivalJitter();
    let end = feed(jitter, 1, Array(10).fill(20));
    end = feed(jitter, 1, Array(10).fill(20), end + 3000);
    expect(jitter.snapshot(end).jitterMs).toBe(0);
  });

  it("reports the worst of several speakers and drops stale ones", () => {
    const jitter = createArrivalJitter();
    feed(jitter, 1, Array(20).fill(20));
    const end = feed(jitter, 2, [2, 38, 2, 38, 2, 38, 2, 38], 100);
    expect(jitter.snapshot(end).jitterMs).toBeGreaterThan(0);
    expect(jitter.snapshot(end + 5000).jitterMs).toBeNull();
  });

  it("knows a speaker is mid-sentence only shortly after a frame", () => {
    const jitter = createArrivalJitter();
    jitter.frame(1, 1000);
    expect(jitter.streaming(1, 1000)).toBe(false);
    jitter.frame(1, 1020);
    jitter.frame(1, 1040);
    expect(jitter.streaming(1, 1050)).toBe(true);
    expect(jitter.streaming(1, 1300)).toBe(false);
    expect(jitter.streaming(2, 1050)).toBe(false);
  });

  it("counts glitches until reset", () => {
    const jitter = createArrivalJitter();
    jitter.glitch();
    jitter.glitch();
    expect(jitter.snapshot(0).glitches).toBe(2);
    jitter.reset();
    expect(jitter.snapshot(0)).toEqual({ jitterMs: null, glitches: 0 });
  });

  it("forgets a speaker who left", () => {
    const jitter = createArrivalJitter();
    jitter.frame(1, 0);
    jitter.forget(1);
    expect(jitter.snapshot(10).jitterMs).toBeNull();
  });
});

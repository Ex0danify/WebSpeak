import { describe, expect, it } from "vitest";
import { TokenBucket, WindowCounter } from "./tokenBucket.js";

describe("TokenBucket", () => {
  it("allows the burst, then refuses until it refills", () => {
    const bucket = new TokenBucket(3, 10, 0);
    expect([bucket.take(0), bucket.take(0), bucket.take(0), bucket.take(0)]).toEqual([true, true, true, false]);
    expect(bucket.take(99)).toBe(false);
    expect(bucket.take(100)).toBe(true);
    expect(bucket.take(100)).toBe(false);
  });

  it("never holds more than its capacity", () => {
    const bucket = new TokenBucket(2, 10, 0);
    expect([bucket.take(60_000), bucket.take(60_000), bucket.take(60_000)]).toEqual([true, true, false]);
  });
});

describe("WindowCounter", () => {
  it("trips at the limit inside one window and starts over after it", () => {
    const counter = new WindowCounter(3, 1000);
    expect([counter.hit(0), counter.hit(10), counter.hit(20)]).toEqual([false, false, true]);
    expect(counter.hit(1500)).toBe(false);
  });
});

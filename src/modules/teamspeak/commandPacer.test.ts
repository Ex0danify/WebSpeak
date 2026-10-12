import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCommandPacer } from "./commandPacer.js";

describe("command pacer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts commands one after another, at least the spacing apart", async () => {
    const pacer = createCommandPacer({ spacingMs: 100 });
    const starts: number[] = [];
    const task = () => {
      starts.push(Date.now());
      return Promise.resolve(starts.length);
    };
    const results = Promise.all([pacer.run(task), pacer.run(task), pacer.run(task)]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await results).toEqual([1, 2, 3]);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(100);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(100);
  });

  it("tries a command again after a flood refusal and then returns its result", async () => {
    const pacer = createCommandPacer({ spacingMs: 0, retryDelayMs: 500, isFlood: (error) => (error as Error).message === "flood" });
    let calls = 0;
    const result = pacer.run(async () => {
      calls += 1;
      if (calls < 3) throw new Error("flood");
      return "ok";
    });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("gives up after the retries and rejects with the last error", async () => {
    const pacer = createCommandPacer({ spacingMs: 0, retries: 2, retryDelayMs: 10, isFlood: () => true });
    let calls = 0;
    const result = pacer.run(async () => {
      calls += 1;
      throw new Error("flood");
    });
    const settled = expect(result).rejects.toThrow("flood");
    await vi.advanceTimersByTimeAsync(5_000);
    await settled;
    expect(calls).toBe(3);
  });

  it("does not retry an error that is not a flood refusal, and a failure does not block the queue", async () => {
    const pacer = createCommandPacer({ spacingMs: 0, isFlood: () => false });
    let calls = 0;
    const failing = pacer.run(async () => {
      calls += 1;
      throw new Error("nope");
    });
    const next = pacer.run(async () => "after");
    const settled = expect(failing).rejects.toThrow("nope");
    await vi.advanceTimersByTimeAsync(1_000);
    await settled;
    expect(await next).toBe("after");
    expect(calls).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { ServerPasswordBackoff } from "./serverPasswordBackoff.js";

describe("ServerPasswordBackoff", () => {
  it("allows a first try and doubles the wait after each failure", () => {
    const backoff = new ServerPasswordBackoff();
    expect(backoff.retryAfterMs("a:9987", 0)).toBe(0);
    backoff.recordFailure("a:9987", 0);
    expect(backoff.retryAfterMs("a:9987", 1_000)).toBe(4_000);
    backoff.recordFailure("a:9987", 5_000);
    expect(backoff.retryAfterMs("a:9987", 5_000)).toBe(10_000);
    expect(backoff.retryAfterMs("b:9987", 5_000)).toBe(0);
  });

  it("caps the wait and clears it on success", () => {
    const backoff = new ServerPasswordBackoff();
    for (let i = 0; i < 20; i++) backoff.recordFailure("a:9987", 0);
    expect(backoff.retryAfterMs("a:9987", 0)).toBe(300_000);
    backoff.recordSuccess("a:9987");
    expect(backoff.retryAfterMs("a:9987", 0)).toBe(0);
  });
});

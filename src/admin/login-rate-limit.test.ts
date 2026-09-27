import { describe, expect, it } from "vitest";
import { AdminLoginRateLimiter } from "./login-rate-limit.js";

const WINDOW_MS = 5 * 60 * 1000;

function fail(limiter: AdminLoginRateLimiter, peer: string, times: number, now = 0): void {
  for (let i = 0; i < times; i += 1) limiter.recordFailure(peer, now);
}

describe("AdminLoginRateLimiter", () => {
  it("does not block a peer without failures", () => {
    expect(new AdminLoginRateLimiter().retryAfterMs("peer", 0)).toBe(0);
  });

  it("allows four failures and locks out on the fifth", () => {
    const limiter = new AdminLoginRateLimiter();
    fail(limiter, "peer", 4);
    expect(limiter.retryAfterMs("peer", 0)).toBe(0);
    limiter.recordFailure("peer", 0);
    expect(limiter.retryAfterMs("peer", 0)).toBe(WINDOW_MS);
  });

  it("reports the remaining lockout time as the window runs down", () => {
    const limiter = new AdminLoginRateLimiter();
    fail(limiter, "peer", 5, 1_000);
    expect(limiter.retryAfterMs("peer", 61_000)).toBe(WINDOW_MS - 60_000);
  });

  it("lifts the lockout when the window from the first failure ends", () => {
    const limiter = new AdminLoginRateLimiter();
    fail(limiter, "peer", 5, 0);
    expect(limiter.retryAfterMs("peer", WINDOW_MS - 1)).toBe(1);
    expect(limiter.retryAfterMs("peer", WINDOW_MS)).toBe(0);
  });

  it("starts a new count after the window, not a continued one", () => {
    const limiter = new AdminLoginRateLimiter();
    fail(limiter, "peer", 4, 0);
    expect(limiter.recordFailure("peer", WINDOW_MS)).toBe(250);
    fail(limiter, "peer", 3, WINDOW_MS);
    expect(limiter.retryAfterMs("peer", WINDOW_MS)).toBe(0);
  });

  it("tracks peers separately", () => {
    const limiter = new AdminLoginRateLimiter();
    fail(limiter, "a", 5);
    expect(limiter.retryAfterMs("a", 0)).toBeGreaterThan(0);
    expect(limiter.retryAfterMs("b", 0)).toBe(0);
  });

  it("forgets a peer after a successful login", () => {
    const limiter = new AdminLoginRateLimiter();
    fail(limiter, "peer", 5);
    limiter.recordSuccess("peer");
    expect(limiter.retryAfterMs("peer", 0)).toBe(0);
    limiter.recordFailure("peer", 0);
    fail(limiter, "peer", 3);
    expect(limiter.retryAfterMs("peer", 0)).toBe(0);
  });

  it("returns an escalating failure delay: 250, 500, 1000, then capped at 2000 ms", () => {
    const limiter = new AdminLoginRateLimiter();
    const delays = Array.from({ length: 6 }, () => limiter.recordFailure("peer", 0));
    expect(delays).toEqual([250, 500, 1000, 2000, 2000, 2000]);
  });

  it("bounds tracked peers by evicting the oldest one among those with the fewest failures", () => {
    const limiter = new AdminLoginRateLimiter(2);
    limiter.recordFailure("old", 0);
    limiter.recordFailure("second", 1);
    limiter.recordFailure("third", 2); // evicts "old": equal failures, the oldest goes
    expect(limiter.recordFailure("old", 3)).toBe(250); // "old" starts again from one failure, not two
  });

  it("F5: a locked-out peer survives a flood of new peers that fail once", () => {
    const limiter = new AdminLoginRateLimiter(3);
    fail(limiter, "locked", 5, 0);
    for (let i = 0; i < 50; i += 1) limiter.recordFailure(`flood-${i}`, 1 + i);
    expect(limiter.retryAfterMs("locked", 100)).toBeGreaterThan(0);
  });

  it("F5: with the default table size, 2000 other peers do not lift a lockout", () => {
    const limiter = new AdminLoginRateLimiter();
    fail(limiter, "locked", 5, 0);
    for (let i = 0; i < 2000; i += 1) limiter.recordFailure(`flood-${i}`, 1 + i);
    expect(limiter.retryAfterMs("locked", 3000)).toBe(WINDOW_MS - 3000);
  });

  it("evicts a locked-out peer only when every tracked peer is locked out, the oldest first", () => {
    const limiter = new AdminLoginRateLimiter(2);
    fail(limiter, "first", 5, 0);
    fail(limiter, "second", 5, 1);
    limiter.recordFailure("third", 2);
    expect(limiter.retryAfterMs("first", 3)).toBe(0);
    expect(limiter.retryAfterMs("second", 3)).toBeGreaterThan(0);
  });

  it("prunes expired peers before evicting live ones", () => {
    const limiter = new AdminLoginRateLimiter(2);
    fail(limiter, "live", 5, WINDOW_MS);
    limiter.recordFailure("stale", 0);
    limiter.recordFailure("new", WINDOW_MS); // "stale" expired, "live" must survive
    expect(limiter.retryAfterMs("live", WINDOW_MS)).toBe(WINDOW_MS);
  });
});

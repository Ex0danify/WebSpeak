import { describe, expect, it } from "vitest";
import { JoinRateLimiter } from "./joinRateLimit.js";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;

describe("JoinRateLimiter", () => {
  it("allows 30 requests per peer in a minute and refuses the 31st", () => {
    const limiter = new JoinRateLimiter();
    for (let i = 0; i < MAX_REQUESTS; i += 1) {
      expect(limiter.allow("peer", 1_000)).toBe(true);
    }
    expect(limiter.allow("peer", 1_000)).toBe(false);
  });

  it("counts peers separately", () => {
    const limiter = new JoinRateLimiter();
    for (let i = 0; i < MAX_REQUESTS; i += 1) limiter.allow("a", 0);
    expect(limiter.allow("a", 0)).toBe(false);
    expect(limiter.allow("b", 0)).toBe(true);
  });

  it("still refuses one millisecond before the window ends", () => {
    const limiter = new JoinRateLimiter();
    for (let i = 0; i < MAX_REQUESTS; i += 1) limiter.allow("peer", 0);
    expect(limiter.allow("peer", WINDOW_MS - 1)).toBe(false);
  });

  it("starts a fresh window exactly when the old one ends", () => {
    const limiter = new JoinRateLimiter();
    for (let i = 0; i < MAX_REQUESTS; i += 1) limiter.allow("peer", 0);
    expect(limiter.allow("peer", WINDOW_MS)).toBe(true);
    for (let i = 1; i < MAX_REQUESTS; i += 1) {
      expect(limiter.allow("peer", WINDOW_MS)).toBe(true);
    }
    expect(limiter.allow("peer", WINDOW_MS)).toBe(false);
  });

  it("does not extend the window on refused requests", () => {
    const limiter = new JoinRateLimiter();
    for (let i = 0; i < MAX_REQUESTS; i += 1) limiter.allow("peer", 0);
    expect(limiter.allow("peer", 30_000)).toBe(false);
    expect(limiter.allow("peer", WINDOW_MS)).toBe(true);
  });

  it("bounds the tracked peers by evicting the oldest one among those with the fewest requests", () => {
    const limiter = new JoinRateLimiter(2);
    for (let i = 0; i < MAX_REQUESTS; i += 1) limiter.allow("old", 0);
    limiter.allow("second", 1);
    limiter.allow("third", 2); // evicts "second": the fewest requests, so "old" keeps its count
    expect(limiter.allow("old", 3)).toBe(false);
    expect(limiter.allow("second", 3)).toBe(true);
  });

  it("F5: a peer at its limit stays limited while many new peers arrive", () => {
    const limiter = new JoinRateLimiter();
    for (let i = 0; i < MAX_REQUESTS; i += 1) limiter.allow("busy", 0);
    for (let i = 0; i < 5000; i += 1) limiter.allow(`flood-${i}`, 1 + i);
    expect(limiter.allow("busy", 6000)).toBe(false);
  });

  it("evicts a peer at its limit only when every tracked peer is at its limit, the oldest first", () => {
    const limiter = new JoinRateLimiter(2);
    for (let i = 0; i < MAX_REQUESTS; i += 1) limiter.allow("first", 0);
    for (let i = 0; i < MAX_REQUESTS; i += 1) limiter.allow("second", 1);
    limiter.allow("third", 2);
    expect(limiter.allow("first", 3)).toBe(true);
    expect(limiter.allow("second", 3)).toBe(false);
  });

  it("drops expired peers before evicting live ones", () => {
    const limiter = new JoinRateLimiter(2);
    for (let i = 0; i < MAX_REQUESTS; i += 1) limiter.allow("live", WINDOW_MS);
    limiter.allow("stale", 0);
    limiter.allow("new", WINDOW_MS); // "stale" expired, so "live" must survive
    expect(limiter.allow("live", WINDOW_MS)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { WebSpeakError } from "../../shared/errors.js";
import { RECONNECT_DELAYS_MS, RECONNECT_WINDOW_MS, isRecoverable, reconnectDelayMs, reconnectWindowOpen } from "./reconnectPolicy.js";

const middle = () => 0.5;

describe("reconnectDelayMs", () => {
  it("follows the backoff table when there is no jitter", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((attempt) => reconnectDelayMs(attempt, middle))).toEqual([1_000, 2_000, 4_000, 8_000, 15_000, 30_000, 30_000]);
    expect(RECONNECT_DELAYS_MS).toEqual([1_000, 2_000, 4_000, 8_000, 15_000, 30_000, 30_000]);
  });

  it("stays at the last delay for every later attempt (cap)", () => {
    for (const attempt of [8, 9, 100, Number.MAX_SAFE_INTEGER, Number.POSITIVE_INFINITY]) {
      expect(reconnectDelayMs(attempt, middle), String(attempt)).toBe(30_000);
    }
  });

  it("treats attempts below 1 as the first attempt and floors fractions", () => {
    for (const attempt of [0, -1, -100, Number.NEGATIVE_INFINITY]) expect(reconnectDelayMs(attempt, middle), String(attempt)).toBe(1_000);
    expect(reconnectDelayMs(1.9, middle)).toBe(1_000);
    expect(reconnectDelayMs(2.9, middle)).toBe(2_000);
  });

  it("falls back to the last delay for NaN (current behavior, not a designed rule)", () => {
    expect(reconnectDelayMs(Number.NaN, middle)).toBe(30_000);
  });

  it("applies at most 10 percent jitter in either direction", () => {
    expect(reconnectDelayMs(1, () => 0)).toBe(900);
    expect(reconnectDelayMs(1, () => 1)).toBe(1_100);
    expect(reconnectDelayMs(4, () => 0)).toBe(7_200);
    expect(reconnectDelayMs(4, () => 1)).toBe(8_800);
    expect(reconnectDelayMs(6, () => 0)).toBe(27_000);
    expect(reconnectDelayMs(6, () => 1)).toBe(33_000);
  });

  it("stays inside the jitter band for every attempt with the real random source", () => {
    for (let attempt = 1; attempt <= 9; attempt += 1) {
      const base = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length) - 1]!;
      for (let i = 0; i < 50; i += 1) {
        const delay = reconnectDelayMs(attempt);
        expect(delay).toBeGreaterThanOrEqual(base * 0.9);
        expect(delay).toBeLessThanOrEqual(base * 1.1);
      }
    }
  });

  it("never returns less than 250 ms, even with a random source outside 0..1", () => {
    expect(reconnectDelayMs(1, () => -50)).toBe(250);
  });
});

describe("reconnectWindowOpen", () => {
  it("is open for five minutes after the start and closed from the boundary on", () => {
    expect(RECONNECT_WINDOW_MS).toBe(300_000);
    expect(reconnectWindowOpen(1_000, 1_000)).toBe(true);
    expect(reconnectWindowOpen(1_000, 1_000 + RECONNECT_WINDOW_MS - 1)).toBe(true);
    expect(reconnectWindowOpen(1_000, 1_000 + RECONNECT_WINDOW_MS)).toBe(false);
    expect(reconnectWindowOpen(1_000, 1_000 + RECONNECT_WINDOW_MS + 1)).toBe(false);
  });

  it("defaults to the current time", () => {
    expect(reconnectWindowOpen(Date.now())).toBe(true);
    expect(reconnectWindowOpen(Date.now() - RECONNECT_WINDOW_MS - 1)).toBe(false);
  });
});

describe("isRecoverable", () => {
  it("follows the retryable flag of the error", () => {
    expect(isRecoverable(new WebSpeakError("unreachable", "x", true))).toBe(true);
    expect(isRecoverable(new WebSpeakError("invalid_target", "x", false))).toBe(false);
  });

  it("treats a missing error as recoverable", () => {
    expect(isRecoverable(null)).toBe(true);
  });
});

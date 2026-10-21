import { describe, expect, it } from "vitest";
import { KeepAlive } from "./keepAlive.js";

describe("KeepAlive", () => {
  it("does not ping before it is started, but detects idleness from the start", () => {
    const keepAlive = new KeepAlive({}, 0);
    expect(keepAlive.takePing(5_000)).toBe(false);
    expect(keepAlive.nextDueAt()).toBe(20_000);
    expect(keepAlive.idle(19_999)).toBe(false);
    expect(keepAlive.idle(20_000)).toBe(true);
  });

  it("pings once per interval after the start", () => {
    const keepAlive = new KeepAlive({ pingIntervalMs: 1_000 }, 0);
    keepAlive.startPinging(100);
    keepAlive.startPinging(500);
    expect(keepAlive.nextDueAt()).toBe(1_100);
    expect(keepAlive.takePing(1_099)).toBe(false);
    expect(keepAlive.takePing(1_100)).toBe(true);
    expect(keepAlive.takePing(1_100)).toBe(false);
    expect(keepAlive.nextDueAt()).toBe(2_100);
  });

  it("moves the idle deadline with every received packet", () => {
    const keepAlive = new KeepAlive({ idleTimeoutMs: 5_000 }, 0);
    keepAlive.received(4_000);
    expect(keepAlive.idle(8_999)).toBe(false);
    expect(keepAlive.nextDueAt()).toBe(9_000);
  });
});

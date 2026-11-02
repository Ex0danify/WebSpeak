import { describe, expect, it } from "vitest";
import { createQualityTracker, rateConnection } from "@/shared/lib/connectionQuality";

describe("rateConnection", () => {
  it("rates each metric on its own scale", () => {
    expect(rateConnection({ rttMs: 20 })).toBe("excellent");
    expect(rateConnection({ rttMs: 75 })).toBe("good");
    expect(rateConnection({ rttMs: 150 })).toBe("poor");
    expect(rateConnection({ rttMs: 400 })).toBe("bad");
    expect(rateConnection({ jitterMs: 45 })).toBe("poor");
    expect(rateConnection({ lossPercent: 3 })).toBe("poor");
    expect(rateConnection({ dropoutsPerMinute: 0 })).toBe("excellent");
    expect(rateConnection({ dropoutsPerMinute: 30 })).toBe("good");
    expect(rateConnection({ dropoutsPerMinute: 120 })).toBe("poor");
    expect(rateConnection({ dropoutsPerMinute: 400 })).toBe("bad");
  });

  it("lets the worst metric decide", () => {
    expect(rateConnection({ rttMs: 20, jitterMs: 5, lossPercent: 6 })).toBe("bad");
  });

  it("treats a bound as the start of the next level", () => {
    expect(rateConnection({ rttMs: 50 })).toBe("good");
    expect(rateConnection({ rttMs: 200 })).toBe("bad");
  });

  it("ignores missing and non-finite values", () => {
    expect(rateConnection({ rttMs: 30, jitterMs: null, lossPercent: undefined })).toBe("excellent");
    expect(rateConnection({ rttMs: Number.NaN })).toBeNull();
    expect(rateConnection({})).toBeNull();
  });
});

describe("createQualityTracker", () => {
  it("adopts the first rating at once", () => {
    expect(createQualityTracker().next("good")).toBe("good");
  });

  it("keeps the level through a single odd sample", () => {
    const tracker = createQualityTracker();
    tracker.next("excellent");
    expect(tracker.next("poor")).toBe("excellent");
    expect(tracker.next("excellent")).toBe("excellent");
    expect(tracker.next("poor")).toBe("excellent");
  });

  it("switches once the new level repeats", () => {
    const tracker = createQualityTracker();
    tracker.next("excellent");
    tracker.next("poor");
    expect(tracker.next("poor")).toBe("poor");
  });

  it("restarts the count when the candidate changes", () => {
    const tracker = createQualityTracker();
    tracker.next("good");
    tracker.next("poor");
    expect(tracker.next("bad")).toBe("good");
  });

  it("shows nothing while unmeasured and starts over afterwards", () => {
    const tracker = createQualityTracker();
    tracker.next("good");
    expect(tracker.next(null)).toBeNull();
    expect(tracker.next("bad")).toBe("bad");
    tracker.reset();
    expect(tracker.next("good")).toBe("good");
  });
});

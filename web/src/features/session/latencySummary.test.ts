import { describe, expect, it } from "vitest";
import { summarizeLatency } from "@/features/session/latencySummary";

const probe = (rtt: number, ts: number | null) => ({ browserRttMs: rtt, teamSpeakLatencyMs: ts, teamSpeakReachable: ts !== null });

describe("summarizeLatency", () => {
  it("is not ready without attempts", () => {
    expect(summarizeLatency([])).toEqual({
      gatewayLatencyMs: null,
      gatewayLossPercent: null,
      teamSpeakLatencyMs: null,
      teamSpeakLossPercent: null,
      ready: false,
    });
  });

  it("takes the median per leg and counts failed probes as loss", () => {
    const summary = summarizeLatency([probe(10, 40), probe(30, 20), null, probe(20, null)]);
    expect(summary.gatewayLatencyMs).toBe(20);
    expect(summary.gatewayLossPercent).toBe(25);
    expect(summary.teamSpeakLatencyMs).toBe(40);
    expect(summary.teamSpeakLossPercent).toBe(50);
    expect(summary.ready).toBe(true);
  });
});

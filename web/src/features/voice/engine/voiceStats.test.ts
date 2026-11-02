import { describe, expect, it } from "vitest";
import { readVoiceStats, type VoiceStatsCounters } from "@/features/voice/engine/voiceStats";

function report(over: { lost?: number; received?: number; concealed?: number; total?: number; bytes?: number } = {}) {
  return [
    {
      id: "in",
      type: "inbound-rtp",
      kind: "audio",
      codecId: "opus",
      jitter: 0.012,
      packetsLost: over.lost ?? 0,
      packetsReceived: over.received ?? 0,
      concealedSamples: over.concealed ?? 0,
      totalSamplesReceived: over.total ?? 0,
    },
    { id: "out", type: "outbound-rtp", kind: "audio", bytesSent: over.bytes ?? 0 },
    { id: "opus", type: "codec", mimeType: "audio/opus" },
    { id: "pair", type: "candidate-pair", selected: true, currentRoundTripTime: 0.042 },
    { id: "video", type: "inbound-rtp", kind: "video", packetsLost: 99 },
  ];
}

describe("readVoiceStats", () => {
  it("has no rates on the first sample, only what is instant", () => {
    const { stats, counters } = readVoiceStats(report({ received: 50 }), 1000, null);
    expect(stats.jitterMs).toBeCloseTo(12);
    expect(stats.rttMs).toBeCloseTo(42);
    expect(stats.codec).toBe("opus");
    expect(stats.lossPercent).toBeNull();
    expect(stats.uplinkKbps).toBeNull();
    expect(counters.packetsReceived).toBe(50);
  });

  it("measures loss and concealment over the interval, not since the start", () => {
    const first = readVoiceStats(report({ lost: 10, received: 1000, concealed: 5000, total: 480000 }), 0, null);
    const { stats } = readVoiceStats(report({ lost: 12, received: 1048, concealed: 5000, total: 528000 }), 1000, first.counters);
    expect(stats.lossPercent).toBeCloseTo(4);
    expect(stats.concealedPercent).toBe(0);
  });

  it("derives the uplink bitrate from the byte delta", () => {
    const first = readVoiceStats(report({ bytes: 1000 }), 0, null);
    const { stats } = readVoiceStats(report({ bytes: 4000 }), 2000, first.counters);
    expect(stats.uplinkKbps).toBeCloseTo(12);
  });

  it("reports nothing for jitter and loss while no audio arrives", () => {
    const first = readVoiceStats(report({ received: 100 }), 0, null);
    const { stats } = readVoiceStats(report({ received: 100 }), 1000, first.counters);
    expect(stats.jitterMs).toBeNull();
    expect(stats.lossPercent).toBeNull();
    expect(stats.concealedPercent).toBeNull();
  });

  it("does not go negative when the counters restart", () => {
    const old: VoiceStatsCounters = {
      at: 0,
      packetsLost: 500,
      packetsReceived: 5000,
      concealedSamples: 900,
      totalSamples: 900000,
      bytesSent: 9000,
    };
    const { stats } = readVoiceStats(report({ lost: 0, received: 20, total: 19200 }), 1000, old);
    expect(stats.lossPercent).toBeNull();
    expect(stats.uplinkKbps).toBeNull();
  });

  it("falls back to the remote report for the round trip and copes with an empty report", () => {
    const remote = [{ id: "r", type: "remote-inbound-rtp", kind: "audio", roundTripTime: 0.08 }];
    expect(readVoiceStats(remote, 0, null).stats.rttMs).toBeCloseTo(80);
    const empty = readVoiceStats([], 0, null).stats;
    expect(empty).toEqual({ jitterMs: null, lossPercent: null, concealedPercent: null, rttMs: null, uplinkKbps: null, codec: null });
  });
});

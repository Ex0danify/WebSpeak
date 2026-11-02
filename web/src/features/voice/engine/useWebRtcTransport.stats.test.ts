// The voice link samples of useWebRtcTransport, read from the peer's getStats().
import { describe, expect, it, vi } from "vitest";
import { started, setup, useTransportFixture } from "@/testSupport/webRtcTransportFixture";

useTransportFixture();

function reportOf(over: { lost?: number; received?: number; bytes?: number }): Map<string, unknown> {
  return new Map<string, unknown>([
    [
      "in",
      { id: "in", type: "inbound-rtp", kind: "audio", jitter: 0.02, packetsLost: over.lost ?? 0, packetsReceived: over.received ?? 0 },
    ],
    ["out", { id: "out", type: "outbound-rtp", kind: "audio", bytesSent: over.bytes ?? 0 }],
    ["pair", { id: "pair", type: "candidate-pair", selected: true, currentRoundTripTime: 0.03 }],
  ]);
}

describe("collectVoiceStats", () => {
  it("is null without a peer", async () => {
    const { transport } = setup();
    expect(await transport.collectVoiceStats()).toBeNull();
  });

  it("measures loss and bitrate between two samples", async () => {
    const { transport, peer } = await started();
    const now = vi.spyOn(performance, "now");
    const getStats = vi.spyOn(peer, "getStats");
    now.mockReturnValue(0);
    getStats.mockResolvedValue(reportOf({ received: 100, bytes: 0 }));
    const first = await transport.collectVoiceStats();
    expect(first).toMatchObject({ jitterMs: 20, rttMs: 30, lossPercent: null, uplinkKbps: null });
    now.mockReturnValue(1000);
    getStats.mockResolvedValue(reportOf({ lost: 5, received: 195, bytes: 2000 }));
    const second = await transport.collectVoiceStats();
    expect(second?.lossPercent).toBeCloseTo(5);
    expect(second?.uplinkKbps).toBeCloseTo(16);
  });

  it("starts the rates over on a new peer", async () => {
    const { transport, peer } = await started();
    vi.spyOn(peer, "getStats").mockResolvedValue(reportOf({ lost: 50, received: 500 }));
    await transport.collectVoiceStats();
    transport.stopWebRtcTransport();
    expect(await transport.collectVoiceStats()).toBeNull();
  });
});

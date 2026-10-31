// The microphone monitor of useWebRtcTransport: the level meter, driven by a fake analyser.
import { describe, expect, it, vi } from "vitest";
import { FakeAnalyserNode } from "@/testSupport/browserStubs";
import { rtc, started, useTransportFixture } from "@/testSupport/webRtcTransportFixture";

useTransportFixture();

describe("microphone monitor", () => {
  function analyserReading(value: number): void {
    vi.spyOn(FakeAnalyserNode.prototype, "getFloatTimeDomainData").mockImplementation((target: Float32Array) => {
      target.fill(value);
    });
  }

  it("reports the level every 50 ms, scaled by six and capped at one", async () => {
    vi.useFakeTimers();
    analyserReading(0.05);
    const { deps } = await started();
    await vi.advanceTimersByTimeAsync(49);
    expect(deps.micLevel.value).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(deps.micLevel.value).toBeCloseTo(0.3);
    analyserReading(0.5);
    await vi.advanceTimersByTimeAsync(50);
    expect(deps.micLevel.value).toBe(1);
  });

  it("stops on transport stop", async () => {
    vi.useFakeTimers();
    analyserReading(0.5);
    const { deps, transport } = await started();
    transport.stopWebRtcTransport();
    deps.micLevel.value = 0;
    await vi.advanceTimersByTimeAsync(500);
    expect(deps.micLevel.value).toBe(0);
  });

  it("gives up quietly when the analyser graph cannot be built", async () => {
    vi.spyOn(rtc.ctx, "createAnalyser").mockImplementation(() => {
      throw new Error("no analyser");
    });
    const { peer } = await started();
    expect(peer.closed).toBe(false);
  });
});

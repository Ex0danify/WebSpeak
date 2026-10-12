// The microphone monitor of useWebRtcTransport: the level meter and the own-client speaking flag, driven by a fake analyser.
import { describe, expect, it, vi } from "vitest";
import { FakeAnalyserNode } from "@/testSupport/browserStubs";
import { rtc, setup, socketStub, started, useTransportFixture } from "@/testSupport/webRtcTransportFixture";

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

  it("marks the own client speaking above the VOX threshold and clears it below", async () => {
    vi.useFakeTimers();
    analyserReading(0.5);
    const made = setup();
    made.session.state.tsClientId = 9;
    made.audio.voxThreshold = 0.1;
    const socket = socketStub();
    made.session.ws = socket;
    await made.transport.startWebRtcTransport(3, socket);
    await vi.advanceTimersByTimeAsync(50);
    expect(made.deps.markSpeaking).toHaveBeenCalledWith(9);
    analyserReading(0.01);
    await vi.advanceTimersByTimeAsync(50);
    expect(made.deps.clearSpeaking).toHaveBeenCalledWith(9);
  });

  it("does not mark speaking while muted or when the track is disabled", async () => {
    vi.useFakeTimers();
    analyserReading(0.5);
    const made = setup();
    made.session.state.tsClientId = 9;
    made.audio.microphoneMuted = true;
    const socket = socketStub();
    await made.transport.startWebRtcTransport(3, socket);
    await vi.advanceTimersByTimeAsync(50);
    expect(made.deps.markSpeaking).not.toHaveBeenCalled();
    expect(made.deps.clearSpeaking).toHaveBeenCalledWith(9);
  });

  it("does not mark speaking while the microphone track is disabled", async () => {
    vi.useFakeTimers();
    analyserReading(0.5);
    const made = setup();
    made.session.state.tsClientId = 9;
    const socket = socketStub();
    await made.transport.startWebRtcTransport(3, socket);
    rtc.micStream!.getAudioTracks()[0]!.enabled = false;
    await vi.advanceTimersByTimeAsync(50);
    expect(made.deps.markSpeaking).not.toHaveBeenCalled();
    expect(made.deps.clearSpeaking).toHaveBeenCalledWith(9);
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

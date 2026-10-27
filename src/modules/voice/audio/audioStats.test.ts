import { describe, expect, it } from "vitest";
import { createAudioFlowStats, snapshotAudioStats, summarizeAudioStats } from "./audioStats.js";
import type { WebClientEntry } from "../voiceTypes.js";

describe("audioStats", () => {
  it("creates zeroed counters with null timestamps and an empty per-client map", () => {
    const stats = createAudioFlowStats();
    expect(stats.ingressFrames).toBe(0);
    expect(stats.ingressFirstAt).toBeNull();
    expect(stats.egressFramesByClient).toEqual({});
    expect(createAudioFlowStats().egressFramesByClient).not.toBe(stats.egressFramesByClient);
  });

  it("snapshots a copy of the entry counters when no WebRTC session exists", () => {
    const entry = { audio: createAudioFlowStats(), webrtc: undefined } as unknown as WebClientEntry;
    entry.audio.ingressFrames = 3;
    const snap = snapshotAudioStats(entry);
    expect(snap).toEqual(entry.audio);
    expect(snap).not.toBe(entry.audio);
  });

  it("overlays the WebRTC session stats on the snapshot", () => {
    const entry = {
      audio: createAudioFlowStats(),
      webrtc: { getStats: () => ({ webrtcQueuePeakFrames: 7 }) },
    } as unknown as WebClientEntry;
    const snap = snapshotAudioStats(entry);
    expect(snap.webrtcQueuePeakFrames).toBe(7);
    expect(entry.audio.webrtcQueuePeakFrames).toBe(0);
  });

  it("has no summary for a session that carried no audio", () => {
    expect(summarizeAudioStats(createAudioFlowStats())).toBeNull();
  });

  it("boils the counters down: a voice frame is 20 ms and every kind of drop adds up", () => {
    const stats = createAudioFlowStats();
    Object.assign(stats, {
      tsSendFrames: 1510,
      tsReceiveFrames: 900,
      tsSendErrors: 2,
      ingressDroppedFrames: 1,
      egressDroppedFrames: 4,
      webrtcQueueDroppedFrames: 8,
    });
    expect(summarizeAudioStats(stats)).toEqual({
      talkSeconds: 30,
      framesSent: 1510,
      framesReceived: 900,
      droppedFrames: 13,
      sendErrors: 2,
    });
  });
});

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
      path: null,
    });
  });

  it("reports the socket path with what the browser delivered and what went back", () => {
    const stats = createAudioFlowStats();
    Object.assign(stats, { ingressFrames: 400, ingressMaxGapMs: 90, egressFrames: 800, egressMaxGapMs: 40 });
    expect(summarizeAudioStats(stats)?.path).toEqual({
      transport: "websocket",
      uplinkFrames: 400,
      uplinkMaxGapMs: 90,
      downlinkFrames: 800,
      downlinkMaxGapMs: 40,
      queueUnderruns: 0,
      lateTicks: 0,
      decodeErrors: 0,
      ice: null,
    });
  });

  it("reads a WebRTC session from its RTP counters and keeps the ICE result", () => {
    const stats = createAudioFlowStats();
    const ice = { state: "connected", localType: "host", remoteType: "srflx", protocol: "udp", rttMs: 41, connectMs: 380 };
    Object.assign(stats, {
      ingressFrames: 5,
      webrtcIce: ice,
      webrtcIngressRtpFrames: 3000,
      webrtcIngressRtpMaxGapMs: 250,
      webrtcEgressRtpFrames: 4000,
      webrtcEgressRtpMaxGapMs: 30,
      webrtcQueueUnderrunTicks: 6,
      webrtcPacerLateTicks: 2,
      webrtcIngressDecodeErrors: 1,
      webrtcDownlinkDecodeErrors: 2,
    });
    expect(summarizeAudioStats(stats)?.path).toEqual({
      transport: "webrtc",
      uplinkFrames: 3000,
      uplinkMaxGapMs: 250,
      downlinkFrames: 4000,
      downlinkMaxGapMs: 30,
      queueUnderruns: 6,
      lateTicks: 2,
      decodeErrors: 3,
      ice,
    });
  });

  it("still reports a WebRTC session whose browser never sent a packet, that silence is the finding", () => {
    const stats = createAudioFlowStats();
    stats.webrtcIce = { state: "failed", localType: null, remoteType: null, protocol: null, rttMs: null, connectMs: null };
    expect(summarizeAudioStats(stats)).toMatchObject({ talkSeconds: 0, path: { transport: "webrtc", uplinkFrames: 0, ice: { state: "failed" } } });
  });
});

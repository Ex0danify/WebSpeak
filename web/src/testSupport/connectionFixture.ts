import { vi } from "vitest";
import type { VoiceLinkStats } from "@/features/voice";

export function voiceLink(over: Partial<VoiceLinkStats> = {}): VoiceLinkStats {
  return {
    transport: "webrtc",
    jitterMs: 4,
    lossPercent: 0,
    concealedPercent: 0,
    rttMs: 20,
    uplinkKbps: 24,
    codec: "opus",
    glitches: null,
    audioFrames: null,
    ...over,
  };
}

/** The connection part of the room session as the profile dialog samples it, healthy unless told otherwise. */
export function fakeConnection(over: { voice?: Partial<VoiceLinkStats> | null; connected?: boolean } = {}) {
  return {
    state: { connected: over.connected ?? true },
    measureLatency: vi.fn(async () => ({ browserRttMs: 30, teamSpeakLatencyMs: 20, teamSpeakReachable: true })),
    collectVoiceStats: vi.fn(async () => (over.voice === null ? null : voiceLink(over.voice))),
  };
}

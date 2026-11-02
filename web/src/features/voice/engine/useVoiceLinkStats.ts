import type { VoiceLinkStats, VoiceStats } from "@/features/voice/engine/voiceStats";

export interface VoiceLinkStatsDeps {
  state: { connected: boolean };
  transport: { collectVoiceStats(): Promise<VoiceStats | null> };
  playback: { arrivalStats(now: number): { jitterMs: number | null; glitches: number; frames: number } };
}

/** The voice link whichever way the audio travels: the peer's own stats, or the estimate from the WebSocket frames. */
export function useVoiceLinkStats({ state, transport, playback }: VoiceLinkStatsDeps) {
  async function collectVoiceStats(): Promise<VoiceLinkStats | null> {
    if (!state.connected) return null;
    const rtc = await transport.collectVoiceStats();
    if (rtc) return { ...rtc, transport: "webrtc", glitches: null, audioFrames: null };
    const { jitterMs, glitches, frames } = playback.arrivalStats(performance.now());
    return {
      jitterMs,
      lossPercent: null,
      concealedPercent: null,
      rttMs: null,
      uplinkKbps: null,
      codec: null,
      transport: "websocket",
      glitches,
      audioFrames: frames,
    };
  }
  return { collectVoiceStats };
}

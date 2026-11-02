const FRAME_MS = 20;
// Longer than this between two frames means the speaker paused, not that the network stalled.
const PAUSE_MS = 100;
const STALE_MS = 2_000;

interface Speaker {
  lastAt: number;
  jitter: number;
  frames: number;
}

/** Jitter of the WebSocket downlink, which has no RTP stats. Frames come every 20 ms, so how far the gap between two
 *  arrivals strays from that is the jitter, smoothed like RFC 3550 does. TCP hides real loss as a late burst, so a
 *  stall shows up here as well, which is what the listener hears. */
export function createArrivalJitter() {
  const speakers = new Map<number, Speaker>();
  let glitchCount = 0;

  return {
    frame(clientId: number, now: number): void {
      const speaker = speakers.get(clientId);
      if (!speaker || now - speaker.lastAt > PAUSE_MS) {
        speakers.set(clientId, { lastAt: now, jitter: 0, frames: 1 });
        return;
      }
      const deviation = Math.abs(now - speaker.lastAt - FRAME_MS);
      speaker.jitter += (deviation - speaker.jitter) / 16;
      speaker.lastAt = now;
      speaker.frames += 1;
    },
    /** True once a speaker is mid-sentence, an empty buffer then is a glitch and not just the start of speech. */
    streaming(clientId: number, now: number): boolean {
      const speaker = speakers.get(clientId);
      return speaker !== undefined && speaker.frames > 2 && now - speaker.lastAt <= PAUSE_MS;
    },
    glitch(): void {
      glitchCount += 1;
    },
    /** The worst speaker heard lately, null when nobody was. */
    snapshot(now: number): { jitterMs: number | null; glitches: number } {
      let worst: number | null = null;
      for (const speaker of speakers.values()) {
        if (now - speaker.lastAt <= STALE_MS) worst = Math.max(worst ?? 0, speaker.jitter);
      }
      return { jitterMs: worst, glitches: glitchCount };
    },
    forget(clientId: number): void {
      speakers.delete(clientId);
    },
    reset(): void {
      speakers.clear();
      glitchCount = 0;
    },
  };
}

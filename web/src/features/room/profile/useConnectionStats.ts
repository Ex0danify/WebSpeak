import { computed, onUnmounted, ref, watch } from "vue";
import { summarizeLatency, type LatencySummary } from "@/features/session";
import { createQualityTracker, rateConnection, type ConnectionQuality } from "@/shared/lib/connectionQuality";
import type { LatencyProbeResult } from "@/features/session";
import type { VoiceLinkStats } from "@/features/voice";
import type { RoomSession } from "@/features/room/roomTypes";

const INTERVAL_MS = 2_000;
const WINDOW_SIZE = 20;
// Dropouts are rated over the last half minute, so the badge recovers once the link does. They are counted per minute of
// incoming speech (50 frames a second), so a quiet room neither hides nor inflates them.
const DROPOUT_WINDOW_MS = 30_000;
const DROPOUT_MIN_FRAMES = 50;
const FRAMES_PER_MINUTE = 3_000;

export interface ConnectionStatsData extends LatencySummary {
  voice: VoiceLinkStats | null;
  dropoutsPerMinute: number | null;
  quality: ConnectionQuality | null;
}

export interface UseConnectionStatsOptions {
  session: Pick<RoomSession["session"], "state" | "measureLatency" | "collectVoiceStats">;
  /** Polling only runs while this is true, so a closed dialog costs nothing. */
  active: () => boolean;
}

/** Own connection figures for the profile dialog: a rolling window of latency probes, the latest voice link sample and the
 *  rating drawn from both. Stops when the connection drops or the owner unmounts and restarts when still wanted. */
export function useConnectionStats(options: UseConnectionStatsOptions) {
  const { state, measureLatency, collectVoiceStats } = options.session;
  const probes = ref<Array<LatencyProbeResult | null>>([]);
  const voice = ref<VoiceLinkStats | null>(null);
  const quality = ref<ConnectionQuality | null>(null);
  const dropoutsPerMinute = ref<number | null>(null);
  const dropoutSamples: Array<{ at: number; glitches: number; frames: number }> = [];
  const tracker = createQualityTracker();
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;
  let generation = 0;

  const stats = computed<ConnectionStatsData>(() => ({
    ...summarizeLatency(probes.value),
    voice: voice.value,
    dropoutsPerMinute: dropoutsPerMinute.value,
    quality: quality.value,
  }));

  function trackDropouts(link: VoiceLinkStats | null): void {
    if (link?.glitches == null || link.audioFrames == null) {
      dropoutSamples.length = 0;
      dropoutsPerMinute.value = null;
      return;
    }
    const at = Date.now();
    dropoutSamples.push({ at, glitches: link.glitches, frames: link.audioFrames });
    while (dropoutSamples.length > 1 && at - dropoutSamples[0].at > DROPOUT_WINDOW_MS) dropoutSamples.shift();
    const first = dropoutSamples[0];
    const frames = link.audioFrames - first.frames;
    dropoutsPerMinute.value =
      frames >= DROPOUT_MIN_FRAMES ? (Math.max(0, link.glitches - first.glitches) / frames) * FRAMES_PER_MINUTE : null;
  }

  async function sample(current: number): Promise<void> {
    if (running || !state.connected) return;
    running = true;
    try {
      const [probe, link] = await Promise.all([measureLatency(), collectVoiceStats()]);
      if (current !== generation) return;
      probes.value = [...probes.value, probe].slice(-WINDOW_SIZE);
      voice.value = link;
      trackDropouts(link);
      const summary = summarizeLatency(probes.value);
      const legs = [summary.gatewayLatencyMs, summary.teamSpeakLatencyMs].filter((value): value is number => value !== null);
      quality.value = tracker.next(
        rateConnection({
          rttMs: legs.length ? Math.max(...legs) : null,
          jitterMs: link?.jitterMs,
          lossPercent: link?.lossPercent,
          dropoutsPerMinute: dropoutsPerMinute.value,
        }),
      );
    } catch {
      // A failed sample leaves the last values on screen, the next tick tries again.
    } finally {
      running = false;
    }
  }

  function start(): void {
    if (timer) return;
    probes.value = [];
    voice.value = null;
    quality.value = null;
    dropoutsPerMinute.value = null;
    dropoutSamples.length = 0;
    tracker.reset();
    const current = ++generation;
    void sample(current);
    timer = setInterval(() => void sample(current), INTERVAL_MS);
  }

  function stop(): void {
    if (timer) clearInterval(timer);
    timer = null;
    generation += 1;
  }

  watch(
    () => options.active() && state.connected,
    (wanted) => (wanted ? start() : stop()),
    { immediate: true },
  );
  onUnmounted(stop);

  return { stats };
}

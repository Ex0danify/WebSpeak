import { computed, onUnmounted, ref, watch } from "vue";
import { summarizeLatency, type LatencySummary } from "@/features/session";
import { createQualityTracker, rateConnection, type ConnectionQuality } from "@/shared/lib/connectionQuality";
import type { LatencyProbeResult } from "@/features/session";
import type { VoiceLinkStats } from "@/features/voice";
import type { RoomSession } from "@/features/room/roomTypes";

const INTERVAL_MS = 2_000;
const WINDOW_SIZE = 20;

export interface ConnectionStatsData extends LatencySummary {
  voice: VoiceLinkStats | null;
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
  const tracker = createQualityTracker();
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;
  let generation = 0;

  const stats = computed<ConnectionStatsData>(() => ({ ...summarizeLatency(probes.value), voice: voice.value, quality: quality.value }));

  async function sample(current: number): Promise<void> {
    if (running || !state.connected) return;
    running = true;
    try {
      const [probe, link] = await Promise.all([measureLatency(), collectVoiceStats()]);
      if (current !== generation) return;
      probes.value = [...probes.value, probe].slice(-WINDOW_SIZE);
      voice.value = link;
      const summary = summarizeLatency(probes.value);
      const legs = [summary.gatewayLatencyMs, summary.teamSpeakLatencyMs].filter((value): value is number => value !== null);
      quality.value = tracker.next(
        rateConnection({
          rttMs: legs.length ? Math.max(...legs) : null,
          jitterMs: link?.jitterMs,
          lossPercent: link?.lossPercent,
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

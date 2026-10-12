import { computed, onUnmounted, ref, watch } from "vue";
import { median } from "@/shared/lib/format.js";
import type { LatencyProbeResult } from "@/features/session";
import type { RoomSession } from "../roomTypes";

const PERFORMANCE_INTERVAL_MS = 3_000;
const PERFORMANCE_WINDOW_SIZE = 20;

export interface UseNetworkPerformanceOptions {
  session: Pick<RoomSession["session"], "state" | "measureLatency">;
}

export interface NetworkPerformanceStats {
  gatewayLatencyMs: number | null;
  gatewayLossPercent: number | null;
  teamSpeakLatencyMs: number | null;
  teamSpeakLossPercent: number | null;
  ready: boolean;
}

/** The network-performance popover with its own open state, a rolling window of browser<->gateway and gateway<->TeamSpeak
 *  latency samples (measureLatency()), and the polling loop that keeps it fresh while open. It stops when the connection drops
 *  or the owner unmounts and restarts on reconnect if still open. */
export function useNetworkPerformance(options: UseNetworkPerformanceOptions) {
  const { state: voiceState, measureLatency } = options.session;

  const performancePanelOpen = ref(false);
  const performanceRunning = ref(false);
  const performanceSamples = ref<LatencyProbeResult[]>([]);
  const performanceProbeResults = ref<Array<LatencyProbeResult | null>>([]);
  const performanceAttempts = ref(0);
  let performanceTimer: number | null = null;
  let performanceMonitorGeneration = 0;

  const performanceStats = computed<NetworkPerformanceStats>(() => {
    const samples = performanceSamples.value;
    const attempts = performanceAttempts.value;
    const gatewaySamples = samples.map((sample) => sample.browserRttMs);
    const teamSpeakSamples = samples
      .filter((sample) => sample.teamSpeakReachable && sample.teamSpeakLatencyMs != null)
      .map((sample) => sample.teamSpeakLatencyMs as number);
    return {
      gatewayLatencyMs: median(gatewaySamples),
      gatewayLossPercent: attempts > 0 ? Math.round(((attempts - samples.length) / attempts) * 100) : null,
      teamSpeakLatencyMs: median(teamSpeakSamples),
      teamSpeakLossPercent: attempts > 0 ? Math.round(((attempts - teamSpeakSamples.length) / attempts) * 100) : null,
      ready: attempts > 0,
    };
  });

  function togglePerformancePanel(): void {
    performancePanelOpen.value = !performancePanelOpen.value;
    if (performancePanelOpen.value) startPerformanceMonitoring();
    else stopPerformanceMonitoring();
  }

  function resetPerformanceSamples(): void {
    performanceProbeResults.value = [];
    performanceSamples.value = [];
    performanceAttempts.value = 0;
  }

  function startPerformanceMonitoring(): void {
    if (performanceTimer || !voiceState.connected) return;
    resetPerformanceSamples();
    const generation = ++performanceMonitorGeneration;
    void runPerformanceProbe(generation);
    performanceTimer = window.setInterval(() => {
      void runPerformanceProbe(generation);
    }, PERFORMANCE_INTERVAL_MS);
  }

  function stopPerformanceMonitoring(): void {
    if (performanceTimer) {
      clearInterval(performanceTimer);
      performanceTimer = null;
    }
    performanceMonitorGeneration += 1;
    performanceRunning.value = false;
  }

  function refreshPerformanceProbe(): void {
    void runPerformanceProbe();
  }

  async function runPerformanceProbe(generation = performanceMonitorGeneration): Promise<void> {
    if (performanceRunning.value || !voiceState.connected || !performancePanelOpen.value) return;
    performanceRunning.value = true;
    try {
      const sample = await measureLatency();
      if (generation !== performanceMonitorGeneration || !performancePanelOpen.value) return;
      performanceProbeResults.value.push(sample);
      if (performanceProbeResults.value.length > PERFORMANCE_WINDOW_SIZE) performanceProbeResults.value.shift();
      performanceAttempts.value = performanceProbeResults.value.length;
      performanceSamples.value = performanceProbeResults.value.filter((result): result is LatencyProbeResult => result !== null);
    } finally {
      if (generation === performanceMonitorGeneration) performanceRunning.value = false;
    }
  }

  watch(
    () => voiceState.connected,
    (connected) => {
      if (!connected) stopPerformanceMonitoring();
      else if (performancePanelOpen.value) startPerformanceMonitoring();
    },
  );

  onUnmounted(stopPerformanceMonitoring);

  return {
    performancePanelOpen,
    performanceRunning,
    performanceSamples,
    performanceProbeResults,
    performanceAttempts,
    performanceStats,
    togglePerformancePanel,
    resetPerformanceSamples,
    startPerformanceMonitoring,
    stopPerformanceMonitoring,
    refreshPerformanceProbe,
    runPerformanceProbe,
  };
}

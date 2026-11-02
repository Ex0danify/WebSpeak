import { median } from "@/shared/lib/format.js";
import type { LatencyProbeResult } from "@/features/session/sessionTypes";

export interface LatencySummary {
  gatewayLatencyMs: number | null;
  gatewayLossPercent: number | null;
  teamSpeakLatencyMs: number | null;
  teamSpeakLossPercent: number | null;
  ready: boolean;
}

/** Median latency and share of failed probes per leg. A failed probe is a null entry, it still counts as an attempt. */
export function summarizeLatency(results: ReadonlyArray<LatencyProbeResult | null>): LatencySummary {
  const attempts = results.length;
  const samples = results.filter((result): result is LatencyProbeResult => result !== null);
  const teamSpeakSamples = samples
    .filter((sample) => sample.teamSpeakReachable && sample.teamSpeakLatencyMs != null)
    .map((sample) => sample.teamSpeakLatencyMs as number);
  return {
    gatewayLatencyMs: median(samples.map((sample) => sample.browserRttMs)),
    gatewayLossPercent: attempts > 0 ? Math.round(((attempts - samples.length) / attempts) * 100) : null,
    teamSpeakLatencyMs: median(teamSpeakSamples),
    teamSpeakLossPercent: attempts > 0 ? Math.round(((attempts - teamSpeakSamples.length) / attempts) * 100) : null,
    ready: attempts > 0,
  };
}

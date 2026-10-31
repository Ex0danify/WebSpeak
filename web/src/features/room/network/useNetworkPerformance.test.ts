import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, reactive } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LatencyProbeResult, VoiceState } from "@/features/session";

type PerformanceStats = {
  gatewayLatencyMs: number | null;
  gatewayLossPercent: number | null;
  teamSpeakLatencyMs: number | null;
  teamSpeakLossPercent: number | null;
  ready: boolean;
};

type Exposed = {
  performancePanelOpen: boolean;
  performanceRunning: boolean;
  performanceSamples: LatencyProbeResult[];
  performanceProbeResults: Array<LatencyProbeResult | null>;
  performanceAttempts: number;
  performanceStats: PerformanceStats;
  togglePerformancePanel: () => void;
  resetPerformanceSamples: () => void;
  startPerformanceMonitoring: () => void;
  stopPerformanceMonitoring: () => void;
  refreshPerformanceProbe: () => void;
  runPerformanceProbe: (generation?: number) => Promise<void>;
};

function makeVoiceState(overrides: Partial<VoiceState> = {}): VoiceState {
  return reactive({
    connected: false,
    connecting: false,
    reconnecting: false,
    reconnectAttempt: 0,
    reconnectFailed: false,
    tsClientId: 0,
    error: "",
    errorCode: "",
    microphoneError: "",
    microphoneErrorCode: "",
    unattributedError: null,
    channelSwitchedChannelId: "",
    ...overrides,
  }) as VoiceState;
}

function sample(overrides: Partial<LatencyProbeResult> = {}): LatencyProbeResult {
  return { browserRttMs: 40, teamSpeakLatencyMs: 20, teamSpeakReachable: true, ...overrides };
}

async function mountUseNetworkPerformance(
  overrides: { voiceState?: VoiceState; measureLatency?: () => Promise<LatencyProbeResult | null> } = {},
) {
  const { useNetworkPerformance } = await import("@/features/room/network/useNetworkPerformance");
  const options = {
    voiceState: makeVoiceState({ connected: true }),
    measureLatency: vi.fn(async () => sample()),
    ...overrides,
  };
  const wrapper = mount(
    defineComponent({
      setup: () => useNetworkPerformance({ session: { state: options.voiceState, measureLatency: options.measureLatency } }),
      template: "<div/>",
    }),
  );
  await flushPromises();
  return { wrapper, vm: wrapper.vm as unknown as Exposed, options };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("togglePerformancePanel", () => {
  it("opens the panel and starts monitoring, running an immediate probe", async () => {
    const { vm, options } = await mountUseNetworkPerformance();
    vm.togglePerformancePanel();
    await flushPromises();
    expect(vm.performancePanelOpen).toBe(true);
    expect(options.measureLatency).toHaveBeenCalledTimes(1);
    expect(vm.performanceAttempts).toBe(1);
  });

  it("closes the panel and stops monitoring", async () => {
    const { vm } = await mountUseNetworkPerformance();
    vm.togglePerformancePanel();
    await flushPromises();
    vm.togglePerformancePanel();
    expect(vm.performancePanelOpen).toBe(false);
    expect(vm.performanceRunning).toBe(false);
  });
});

describe("startPerformanceMonitoring", () => {
  it("does nothing when not connected", async () => {
    const { vm, options } = await mountUseNetworkPerformance({ voiceState: makeVoiceState({ connected: false }) });
    vm.startPerformanceMonitoring();
    await flushPromises();
    expect(options.measureLatency).not.toHaveBeenCalled();
  });

  it("polls on the configured interval while monitoring", async () => {
    const { vm, options } = await mountUseNetworkPerformance();
    vm.togglePerformancePanel();
    await flushPromises();
    expect(options.measureLatency).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(options.measureLatency).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(options.measureLatency).toHaveBeenCalledTimes(3);
  });

  it("resets prior samples before starting", async () => {
    const { vm } = await mountUseNetworkPerformance();
    vm.togglePerformancePanel();
    await flushPromises();
    expect(vm.performanceAttempts).toBe(1);
    vm.togglePerformancePanel();
    vm.startPerformanceMonitoring();
    expect(vm.performanceAttempts).toBe(0);
    expect(vm.performanceSamples).toEqual([]);
  });
});

describe("stopPerformanceMonitoring", () => {
  it("clears the interval so further ticks do not probe", async () => {
    const { vm, options } = await mountUseNetworkPerformance();
    vm.togglePerformancePanel();
    await flushPromises();
    vm.stopPerformanceMonitoring();
    await vi.advanceTimersByTimeAsync(9_000);
    expect(options.measureLatency).toHaveBeenCalledTimes(1);
  });

  it("invalidates an in-flight probe from the stopped generation", async () => {
    let resolveProbe: (value: LatencyProbeResult) => void = () => undefined;
    const measureLatency = vi.fn(
      () =>
        new Promise<LatencyProbeResult>((resolve) => {
          resolveProbe = resolve;
        }),
    );
    const { vm } = await mountUseNetworkPerformance({ measureLatency });
    vm.togglePerformancePanel();
    vm.stopPerformanceMonitoring();
    resolveProbe(sample());
    await flushPromises();
    expect(vm.performanceAttempts).toBe(0);
    expect(vm.performanceRunning).toBe(false);
  });
});

describe("refreshPerformanceProbe / runPerformanceProbe", () => {
  it("does nothing when the panel is closed", async () => {
    const { vm, options } = await mountUseNetworkPerformance();
    vm.refreshPerformanceProbe();
    await flushPromises();
    expect(options.measureLatency).not.toHaveBeenCalled();
  });

  it("does nothing when a probe is already running", async () => {
    let resolveProbe: (value: LatencyProbeResult) => void = () => undefined;
    const measureLatency = vi.fn(
      () =>
        new Promise<LatencyProbeResult>((resolve) => {
          resolveProbe = resolve;
        }),
    );
    const { vm } = await mountUseNetworkPerformance({ measureLatency });
    vm.togglePerformancePanel();
    expect(vm.performanceRunning).toBe(true);
    vm.refreshPerformanceProbe();
    expect(measureLatency).toHaveBeenCalledTimes(1);
    resolveProbe(sample());
    await flushPromises();
  });

  it("caps the retained window at 20 samples", async () => {
    const { vm } = await mountUseNetworkPerformance();
    vm.togglePerformancePanel();
    await flushPromises();
    for (let i = 0; i < 25; i++) {
      await vi.advanceTimersByTimeAsync(3_000);
    }
    expect(vm.performanceProbeResults.length).toBeLessThanOrEqual(20);
    expect(vm.performanceAttempts).toBeLessThanOrEqual(20);
  });
});

describe("performanceStats", () => {
  it("reports not-ready with no attempts", async () => {
    const { vm } = await mountUseNetworkPerformance();
    expect(vm.performanceStats).toEqual({
      gatewayLatencyMs: null,
      gatewayLossPercent: null,
      teamSpeakLatencyMs: null,
      teamSpeakLossPercent: null,
      ready: false,
    });
  });

  it("computes medians and loss percentages from collected samples", async () => {
    const results = [
      sample({ browserRttMs: 10, teamSpeakLatencyMs: 5 }),
      null,
      sample({ browserRttMs: 30, teamSpeakReachable: false, teamSpeakLatencyMs: null }),
    ];
    const measureLatency = vi.fn().mockResolvedValueOnce(results[0]).mockResolvedValueOnce(results[1]).mockResolvedValueOnce(results[2]);
    const { vm } = await mountUseNetworkPerformance({ measureLatency });
    vm.togglePerformancePanel();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(3_000);
    await flushPromises();
    await vi.advanceTimersByTimeAsync(3_000);
    await flushPromises();
    expect(vm.performanceStats.ready).toBe(true);
    expect(vm.performanceStats.gatewayLatencyMs).toBe(30);
    expect(vm.performanceStats.gatewayLossPercent).toBe(Math.round((1 / 3) * 100));
  });
});

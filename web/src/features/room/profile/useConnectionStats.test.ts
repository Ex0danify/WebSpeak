import { mount } from "@vue/test-utils";
import { defineComponent, nextTick, reactive, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConnectionStats } from "@/features/room/profile/useConnectionStats";
import type { LatencyProbeResult } from "@/features/session";
import type { VoiceLinkStats } from "@/features/voice";
import { voiceLink } from "@/testSupport/connectionFixture";

const probe = (rtt: number, ts: number | null = 20): LatencyProbeResult => ({
  browserRttMs: rtt,
  teamSpeakLatencyMs: ts,
  teamSpeakReachable: ts !== null,
});

const link = voiceLink;

function mountStats(measure: () => Promise<LatencyProbeResult | null>, collect: () => Promise<VoiceLinkStats | null>) {
  const state = reactive({ connected: true });
  const active = ref(true);
  let exposed!: ReturnType<typeof useConnectionStats>;
  const wrapper = mount(
    defineComponent({
      setup() {
        exposed = useConnectionStats({
          session: { state, measureLatency: measure, collectVoiceStats: collect } as never,
          active: () => active.value,
        });
        return () => null;
      },
    }),
  );
  return { wrapper, state, active, stats: () => exposed.stats.value };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useConnectionStats", () => {
  it("samples at once, then every two seconds, and rates the connection", async () => {
    const measure = vi.fn(async () => probe(30));
    const { stats } = mountStats(measure, async () => link());
    await vi.advanceTimersByTimeAsync(0);
    expect(measure).toHaveBeenCalledTimes(1);
    expect(stats()).toMatchObject({ gatewayLatencyMs: 30, teamSpeakLatencyMs: 20, quality: "excellent", ready: true });
    await vi.advanceTimersByTimeAsync(2000);
    expect(measure).toHaveBeenCalledTimes(2);
  });

  it("lets the voice link pull the rating down", async () => {
    const { stats } = mountStats(
      async () => probe(30),
      async () => link({ jitterMs: 45 }),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(stats().quality).toBe("poor");
  });

  it("rates on the slower of the two latency legs", async () => {
    const { stats } = mountStats(
      async () => probe(20, 250),
      async () => link(),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(stats().quality).toBe("bad");
  });

  it("does not poll while inactive and starts fresh when activated", async () => {
    const measure = vi.fn(async () => probe(30));
    const { active, stats } = mountStats(measure, async () => link());
    await vi.advanceTimersByTimeAsync(0);
    active.value = false;
    await nextTick();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(measure).toHaveBeenCalledTimes(1);
    active.value = true;
    await nextTick();
    expect(stats().ready).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(measure).toHaveBeenCalledTimes(2);
  });

  it("stops when the connection drops and when unmounted", async () => {
    const measure = vi.fn(async () => probe(30));
    const { state, wrapper } = mountStats(measure, async () => link());
    await vi.advanceTimersByTimeAsync(0);
    state.connected = false;
    await nextTick();
    await vi.advanceTimersByTimeAsync(6000);
    expect(measure).toHaveBeenCalledTimes(1);
    state.connected = true;
    await nextTick();
    await vi.advanceTimersByTimeAsync(0);
    expect(measure).toHaveBeenCalledTimes(2);
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(6000);
    expect(measure).toHaveBeenCalledTimes(2);
  });

  it("counts a failed probe as loss, keeps going and never overlaps samples", async () => {
    let calls = 0;
    const measure = vi.fn(() => {
      calls += 1;
      return calls === 1
        ? new Promise<LatencyProbeResult | null>((resolve) => setTimeout(() => resolve(null), 3000))
        : Promise.resolve(probe(30));
    });
    const { stats } = mountStats(measure, async () => link());
    await vi.advanceTimersByTimeAsync(2000);
    expect(measure).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(stats().gatewayLossPercent).toBe(100);
    await vi.advanceTimersByTimeAsync(2000);
    expect(stats().gatewayLossPercent).toBe(50);
  });

  it("survives a failing sample", async () => {
    const measure = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(probe(30));
    const { stats } = mountStats(measure, async () => link());
    await vi.advanceTimersByTimeAsync(0);
    expect(stats().ready).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(stats().ready).toBe(true);
  });
});

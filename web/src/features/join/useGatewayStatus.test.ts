import { effectScope } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGatewayStatus } from "@/features/join/useGatewayStatus";

function setup(onRecover?: () => void) {
  const scope = effectScope();
  const gateway = scope.run(() => useGatewayStatus({ onRecover }))!;
  return { gateway, scope };
}

describe("useGatewayStatus", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("is online after the first answer and keeps polling", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const { gateway, scope } = setup();
    expect(gateway.status.value).toBe("checking");
    gateway.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(gateway.status.value).toBe("online");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    scope.stop();
  });

  it("goes offline only on the second miss in a row", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { gateway, scope } = setup();
    gateway.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(gateway.status.value).toBe("checking");
    await vi.advanceTimersByTimeAsync(1500);
    expect(gateway.status.value).toBe("offline");
    scope.stop();
  });

  it("treats an error status as a miss", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    const { gateway, scope } = setup();
    gateway.start();
    await vi.advanceTimersByTimeAsync(1500);
    expect(gateway.status.value).toBe("offline");
    scope.stop();
  });

  it("retries every 5 s while offline, counts down, and calls onRecover once when the gateway returns", async () => {
    const onRecover = vi.fn();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { gateway, scope } = setup(onRecover);
    gateway.start();
    await vi.advanceTimersByTimeAsync(1500);
    expect(gateway.status.value).toBe("offline");
    const callsWhenOffline = fetchMock.mock.calls.length;
    expect(gateway.retryIn.value).toBe(5);
    await vi.advanceTimersByTimeAsync(2000);
    expect(gateway.retryIn.value).toBe(3);
    await vi.advanceTimersByTimeAsync(2999);
    expect(fetchMock.mock.calls.length).toBe(callsWhenOffline);
    fetchMock.mockResolvedValue({ ok: true });
    await vi.advanceTimersByTimeAsync(1);
    expect(gateway.status.value).toBe("online");
    expect(gateway.retryIn.value).toBe(20);
    expect(onRecover).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(onRecover).toHaveBeenCalledTimes(1);
    scope.stop();
  });

  it("keeps the 5 s pace on repeated misses instead of backing off", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { gateway, scope } = setup();
    gateway.start();
    await vi.advanceTimersByTimeAsync(1500);
    const before = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000 * 4);
    expect(fetchMock.mock.calls.length - before).toBe(4);
    scope.stop();
  });

  it("a request that never answers counts as a miss", async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
    );
    const { gateway, scope } = setup();
    gateway.start();
    await vi.advanceTimersByTimeAsync(4000);
    expect(gateway.status.value).toBe("checking");
    await vi.advanceTimersByTimeAsync(1500 + 4000);
    expect(gateway.status.value).toBe("offline");
    scope.stop();
  });

  it("checks again when the tab becomes visible", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const { gateway, scope } = setup();
    gateway.start();
    await vi.advanceTimersByTimeAsync(0);
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    scope.stop();
  });

  it("stops polling with its scope", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const { gateway, scope } = setup();
    gateway.start();
    await vi.advanceTimersByTimeAsync(0);
    scope.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

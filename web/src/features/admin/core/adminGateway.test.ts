import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { registerAdminStores } from "@/features/admin/shell/adminStores";
import { useAdminGatewayStore } from "@/features/admin/core/adminGateway";
import { useAdminOverviewStore } from "@/features/admin/dashboard/adminOverview";
import { useAdminServersStore } from "@/features/admin/gateway/adminServers";
import { useAdminServerSettingsStore } from "@/features/admin/settings/adminServerSettings";

vi.mock("vue-router", () => ({ useRoute: () => ({ path: "/admin" }), useRouter: () => ({ replace: vi.fn() }) }));

let healthy = true;

beforeEach(() => {
  vi.useFakeTimers();
  healthy = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (!healthy) throw new TypeError("Failed to fetch");
      return new Response("{}", { status: 200 });
    }),
  );
  setActivePinia(createPinia());
  registerAdminStores();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useAdminGatewayStore", () => {
  it("is not offline before the first answer, and online after it", async () => {
    const store = useAdminGatewayStore();
    store.start();
    expect(store.offline).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    await nextTick();
    expect(store.status).toBe("online");
    store.stop();
  });

  it("goes offline after two misses and reloads the console data when the gateway returns", async () => {
    const loadOverview = vi.fn(async () => {});
    const loadServers = vi.fn(async () => {});
    const loadServerSettings = vi.fn(async () => {});
    Object.assign(useAdminOverviewStore(), { loadOverview });
    Object.assign(useAdminServersStore(), { loadServers });
    Object.assign(useAdminServerSettingsStore(), { loadServerSettings });
    const store = useAdminGatewayStore();
    store.start();
    await vi.advanceTimersByTimeAsync(0);
    healthy = false;
    await vi.advanceTimersByTimeAsync(20_000);
    await vi.advanceTimersByTimeAsync(1500);
    await nextTick();
    expect(store.offline).toBe(true);
    expect(store.retryIn).toBeGreaterThan(0);

    healthy = true;
    await store.retryNow();
    await nextTick();
    expect(store.offline).toBe(false);
    expect(store.recoveries).toBe(1);
    expect(loadOverview).toHaveBeenCalled();
    expect(loadServers).toHaveBeenCalled();
    expect(loadServerSettings).toHaveBeenCalled();
    store.stop();
  });

  it("stops polling and forgets the status on reset", async () => {
    const store = useAdminGatewayStore();
    store.start();
    await vi.advanceTimersByTimeAsync(0);
    store.reset();
    expect(store.status).toBe("checking");
    const fetchCalls = () => (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const calls = fetchCalls().length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchCalls()).toHaveLength(calls);
  });
});

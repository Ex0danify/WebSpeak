import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Persistence from "@/shared/services/localPersistence";
import { mountClient, warmClient } from "@/testSupport/mountClient";

// The device-identity flow of the join view on the real component: the selected identity's material flows
// into the connection inputs, the ephemeral choice clears them, and the picked identity survives a reload.
// Only the browser edges are replaced (IndexedDB, fetch, the AudioWorkletNode class the noise suppressor
// extends); JoinView and useRoomSession run as in the app.

const STORED = "stored-identity-material";
const OTHER = "other-identity-material";

type Manager = {
  selectedId: { value: string | undefined };
  identities: { value: Persistence.StoredIdentity[] };
  select: (id: string | undefined) => Promise<void>;
  refresh: () => Promise<void>;
};
type View = {
  identityMaterial: string;
  rememberIdentity: boolean;
  identityReady: boolean;
  identityManager: Manager;
};

let store: typeof Persistence;
let wrapper: VueWrapper | undefined;

beforeAll(async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("AudioWorkletNode", class {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } })),
  );
  store = await import("@/shared/services/localPersistence");
  // mountClient() imports the router and JoinView lazily; under CPU load that cold import alone
  // exceeds the 5 s test default for the first test, so it is paid here against the 30 s budget.
  await warmClient();
}, 30_000);

beforeEach(async () => {
  localStorage.clear();
  await store.clearLocalData();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});

/** Mounts the view and waits until it has finished reading the identity list. */
async function mountView(): Promise<View> {
  const mounted = await mountClient();
  wrapper = mounted.wrapper;
  const view = mounted.page as unknown as View;
  await vi.waitFor(() => expect(view.identityReady).toBe(true));
  await flushPromises();
  return view;
}

describe("binding the selected identity on mount", () => {
  it("uses no identity and stays ephemeral on a first visit", async () => {
    const view = await mountView();
    expect(view.identityManager.selectedId.value).toBeUndefined();
    expect(view.identityMaterial).toBe("");
    expect(view.rememberIdentity).toBe(false);
  });

  it("restores the persisted selection and loads its material", async () => {
    await store.saveStoredIdentity(STORED);
    await store.saveLocalPreferences({ schemaVersion: 1, selectedIdentityId: "current" });
    const view = await mountView();
    expect(view.identityManager.selectedId.value).toBe("current");
    expect(view.identityMaterial).toBe(STORED);
    expect(view.rememberIdentity).toBe(true);
  });

  it("falls back to the first identity when nothing is persisted", async () => {
    await store.saveStoredIdentity(STORED);
    const view = await mountView();
    expect(view.identityManager.selectedId.value).toBe("current");
    expect(view.identityMaterial).toBe(STORED);
  });
});

describe("switching the selection", () => {
  it("clears the material and remembered flag when ephemeral is chosen", async () => {
    await store.saveStoredIdentity(STORED);
    await store.saveLocalPreferences({ schemaVersion: 1, selectedIdentityId: "current" });
    const view = await mountView();
    await view.identityManager.select(undefined);
    await flushPromises();
    expect(view.identityMaterial).toBe("");
    expect(view.rememberIdentity).toBe(false);
    expect((await store.loadLocalPreferences()).selectedIdentityId).toBeUndefined();
  });

  it("loads the material of a newly selected identity", async () => {
    const now = Date.now();
    await store.saveStoredIdentity(STORED);
    await store.saveIdentity({ id: "work", label: "Work", privateMaterial: OTHER, createdAt: now, lastUsedAt: now });
    const view = await mountView();
    await view.identityManager.refresh();
    await view.identityManager.select("work");
    await flushPromises();
    expect(view.identityMaterial).toBe(OTHER);
    expect(view.rememberIdentity).toBe(true);

    wrapper?.unmount();
    const next = await mountView();
    expect(next.identityManager.selectedId.value).toBe("work");
    expect(next.identityMaterial).toBe(OTHER);
  });
});

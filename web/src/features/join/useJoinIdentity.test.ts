import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Persistence from "@/shared/services/localPersistence";
import { mountClient } from "@/testSupport/mountClient";

// The remembered-identity flow of the join view, tested on the real component:
// identity restore on mount, save when the gateway hands one out, and the
// checkbox. Only the browser edges are replaced (IndexedDB, fetch, and the
// AudioWorkletNode class that the noise suppressor library extends when it loads).
// JoinView and useRoomSession run as they do in the app.

const KEY = "webspeak:remember-identity";
const STORED = "stored-identity-material";

type View = {
  identityMaterial: string;
  rememberIdentity: boolean;
  identityReady: boolean;
};

let store: typeof Persistence;
let wrapper: VueWrapper | undefined;

beforeAll(async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("AudioWorkletNode", class {});
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } })));
  store = await import("@/shared/services/localPersistence");
}, 30_000);

beforeEach(async () => {
  localStorage.clear();
  await store.clearLocalData();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});

/** Mounts the view and waits until it has finished reading the stored identity. */
async function mountView(): Promise<View> {
  const mounted = await mountClient();
  wrapper = mounted.wrapper;
  const view = mounted.page as unknown as View;
  await vi.waitFor(() => expect(view.identityReady).toBe(true));
  await flushPromises();
  return view;
}

describe("restoring the identity on mount", () => {
  it("restores it when remember-identity is 1", async () => {
    await store.saveStoredIdentity(STORED);
    localStorage.setItem(KEY, "1");
    const view = await mountView();
    expect(view.identityMaterial).toBe(STORED);
    expect(view.rememberIdentity).toBe(true);
  });

  it("does not restore it when remember-identity is 0, and the checkbox is off", async () => {
    await store.saveStoredIdentity(STORED);
    localStorage.setItem(KEY, "0");
    const view = await mountView();
    expect(view.identityMaterial).toBe("");
    expect(view.rememberIdentity).toBe(false);
  });

  it("has nothing to restore on a first visit", async () => {
    const view = await mountView();
    expect(view.identityMaterial).toBe("");
  });

  // F1: with no key the checkbox shows on, so the stored identity is restored, as the checkbox says.
  it("restores a stored identity when the key was never written (F1)", async () => {
    await store.saveStoredIdentity(STORED);
    const view = await mountView();
    expect(view.rememberIdentity).toBe(true);
    expect(view.identityMaterial).toBe(STORED);
  });
});

describe("saving and forgetting", () => {
  it("saves the identity the gateway hands out when remember is on", async () => {
    localStorage.setItem(KEY, "1");
    const view = await mountView();
    view.identityMaterial = "fresh-material";
    await vi.waitFor(async () => expect((await store.loadStoredIdentity())?.privateMaterial).toBe("fresh-material"));
  });

  it("does not save it, and drops it from memory, when remember is off", async () => {
    localStorage.setItem(KEY, "0");
    const view = await mountView();
    view.identityMaterial = "fresh-material";
    await flushPromises();
    expect(view.identityMaterial).toBe("");
    expect(await store.loadStoredIdentity()).toBeNull();
  });

  it("turning remember off writes 0, clears the identity in memory and deletes the stored one", async () => {
    await store.saveStoredIdentity(STORED);
    localStorage.setItem(KEY, "1");
    const view = await mountView();
    view.rememberIdentity = false;
    await vi.waitFor(async () => expect(await store.loadStoredIdentity()).toBeNull());
    expect(localStorage.getItem(KEY)).toBe("0");
    expect(view.identityMaterial).toBe("");
  });

  it("turning remember on writes 1, which is what makes the next visit restore it", async () => {
    localStorage.setItem(KEY, "0");
    const view = await mountView();
    view.rememberIdentity = true;
    await flushPromises();
    expect(localStorage.getItem(KEY)).toBe("1");
    view.identityMaterial = "kept-material";
    await vi.waitFor(async () => expect((await store.loadStoredIdentity())?.privateMaterial).toBe("kept-material"));

    wrapper?.unmount();
    const next = await mountView();
    expect(next.identityMaterial).toBe("kept-material");
  });
});

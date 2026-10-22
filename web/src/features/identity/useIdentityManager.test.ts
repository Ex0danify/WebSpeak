import { IDBFactory } from "fake-indexeddb";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLocalData, loadLocalPreferences, saveIdentity } from "@/shared/services/localPersistence";
import { useIdentityManager } from "@/features/identity/useIdentityManager";

/** An SSE body split across chunks so the client's frame buffering is exercised. */
function sseResponse(frames: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const MINT_FRAMES = [
  'event: position\ndata: {"ahead":1}\n\n',
  'event: minting\ndata: {"level":8}\n\n',
  'event: identity\ndata: {"identity":"minted-material",',
  '"level":8}\n\n',
];

beforeAll(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
});

beforeEach(async () => {
  await clearLocalData();
  vi.stubGlobal("fetch", vi.fn());
});

async function seed(id: string, label?: string): Promise<void> {
  await saveIdentity({ id, label, privateMaterial: `${id}-material`, createdAt: 1, lastUsedAt: 1 });
}

describe("useIdentityManager", () => {
  it("lists saved identities and restores the preferred selection on init", async () => {
    await seed("a", "Alpha");
    await seed("b", "Beta");
    const manager = useIdentityManager();
    await manager.select("b");

    const restored = useIdentityManager();
    await restored.init();
    expect(restored.identities.value.map((entry) => entry.id).sort()).toEqual(["a", "b"]);
    expect(restored.selectedId.value).toBe("b");
  });

  it("falls back to the first identity when none is preferred", async () => {
    await seed("only");
    const manager = useIdentityManager();
    await manager.init();
    expect(manager.selectedId.value).toBe("only");
  });

  it("persists the selection to preferences", async () => {
    await seed("a");
    const manager = useIdentityManager();
    await manager.init();
    await manager.select("a");
    expect((await loadLocalPreferences()).selectedIdentityId).toBe("a");
  });

  it("mints, saves and selects a new identity, relaying queue position", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => sseResponse(MINT_FRAMES)),
    );
    const manager = useIdentityManager();
    const result = await manager.create({ label: "Minted", level: 8 });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected mint to succeed");
    expect(result.identity.privateMaterial).toBe("minted-material");
    expect(result.identity.label).toBe("Minted");
    expect(manager.selectedId.value).toBe(result.identity.id);
    expect(manager.mintState.value.phase).toBe("done");
    expect(manager.identities.value.some((entry) => entry.id === result.identity.id)).toBe(true);
  });

  it("reports the gateway code when a mint is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: false, code: "MINT_BUSY" }), { status: 429, headers: { "content-type": "application/json" } }),
      ),
    );
    const manager = useIdentityManager();
    const result = await manager.create();
    expect(result).toEqual({ ok: false, code: "MINT_BUSY" });
    expect(manager.mintState.value).toMatchObject({ phase: "error", code: "MINT_BUSY" });
  });

  it("renames and removes identities, reselecting after a delete", async () => {
    await seed("a", "Alpha");
    await seed("b", "Beta");
    const manager = useIdentityManager();
    await manager.init();
    await manager.select("a");

    await manager.rename("a", "Renamed");
    expect(manager.identities.value.find((entry) => entry.id === "a")?.label).toBe("Renamed");

    await manager.remove("a");
    expect(manager.identities.value.some((entry) => entry.id === "a")).toBe(false);
    expect(manager.selectedId.value).toBe("b");
  });

  it("adopts the first identity as the default and lets the selection fall back to it", async () => {
    await seed("a", "Alpha");
    await seed("b", "Beta");
    const manager = useIdentityManager();
    await manager.init();
    expect(manager.defaultId.value).toBe("a");
    expect(manager.selectedId.value).toBe("a");
    expect((await loadLocalPreferences()).defaultIdentityId).toBe("a");
  });

  it("makes a freshly minted identity the default when none is set", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => sseResponse(MINT_FRAMES)),
    );
    const manager = useIdentityManager();
    await manager.init();
    expect(manager.defaultId.value).toBeUndefined();
    const result = await manager.create({ label: "First", level: 8 });
    if (!result.ok) throw new Error("expected mint to succeed");
    expect(manager.defaultId.value).toBe(result.identity.id);
  });

  it("changes the default without changing the selection, and persists it", async () => {
    await seed("a", "Alpha");
    await seed("b", "Beta");
    const manager = useIdentityManager();
    await manager.init();
    await manager.select("a");
    await manager.setDefault("b");
    expect(manager.defaultId.value).toBe("b");
    expect(manager.selectedId.value).toBe("a");
    expect((await loadLocalPreferences()).defaultIdentityId).toBe("b");
  });

  it("reassigns the default to a remaining identity when the default is removed", async () => {
    await seed("a", "Alpha");
    await seed("b", "Beta");
    const manager = useIdentityManager();
    await manager.init();
    expect(manager.defaultId.value).toBe("a");
    await manager.remove("a");
    expect(manager.defaultId.value).toBe("b");
  });

  it("exports the stored material of a known identity", async () => {
    await seed("a", "Alpha");
    const manager = useIdentityManager();
    await manager.init();
    expect(manager.exportIdentity("a")).toEqual({ label: "Alpha", privateMaterial: "a-material" });
    expect(manager.exportIdentity("missing")).toBeNull();
  });

  it("imports material only after the gateway validates it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ ok: true, level: 8 }), { status: 200, headers: { "content-type": "application/json" } }),
      ),
    );
    const manager = useIdentityManager();
    await manager.init();
    const result = await manager.importIdentity("valid-material", "Imported");
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected import to succeed");
    expect(manager.selectedId.value).toBe(result.identity.id);
    expect(manager.identities.value.some((entry) => entry.privateMaterial === "valid-material")).toBe(true);
  });

  it("rejects invalid import material without storing it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: false, code: "INVALID_IDENTITY" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    const manager = useIdentityManager();
    await manager.init();
    const result = await manager.importIdentity("broken");
    expect(result).toEqual({ ok: false, code: "INVALID_IDENTITY" });
    expect(manager.identities.value).toHaveLength(0);
  });
});

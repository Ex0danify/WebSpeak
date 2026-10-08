import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Persistence from "./localPersistence";

// The module keeps one open database in module state, so every test gets a new
// in-memory IndexedDB and a fresh copy of the module.
let store: typeof Persistence;

async function fresh(factory: IDBFactory | null = new IDBFactory()) {
  vi.stubGlobal("indexedDB", factory ?? undefined);
  vi.resetModules();
  store = await import("./localPersistence");
}

beforeEach(() => fresh());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const favorite = (id: string, label = id): Persistence.FavoriteServer => ({ id, label, address: `${id}.example:9987` });
const recent = (id: string, lastConnectedAt: number): Persistence.RecentServer => ({ id, address: `${id}.example:9987`, lastConnectedAt });

describe("identity", () => {
  it("is null before anything was saved", async () => {
    expect(await store.loadStoredIdentity()).toBeNull();
  });

  it("saves and loads the private material under the fixed id 'current'", async () => {
    expect(await store.saveStoredIdentity("secret-material", "Laptop")).toBe(true);
    expect(await store.loadStoredIdentity()).toMatchObject({ id: "current", label: "Laptop", privateMaterial: "secret-material" });
  });

  it("labels a default save 'This device' and renames the old Chinese default on read", async () => {
    await store.saveStoredIdentity("a");
    expect(await store.loadStoredIdentity()).toMatchObject({ label: "This device" });
    await store.saveStoredIdentity("b", "\u6b64\u8bbe\u5907");
    expect(await store.loadStoredIdentity()).toMatchObject({ label: "This device" });
  });

  it("replaces the identity on a second save but keeps createdAt", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_000);
    await store.saveStoredIdentity("first");
    vi.setSystemTime(5_000);
    await store.saveStoredIdentity("second");
    expect(await store.loadStoredIdentity()).toMatchObject({ privateMaterial: "second", createdAt: 1_000, lastUsedAt: 5_000 });
  });

  it("removes it, and removing when there is none is fine", async () => {
    await store.removeStoredIdentity();
    await store.saveStoredIdentity("x");
    await store.removeStoredIdentity();
    expect(await store.loadStoredIdentity()).toBeNull();
  });

  it("is still there after the module is loaded again on the same database", async () => {
    const factory = new IDBFactory();
    await fresh(factory);
    await store.saveStoredIdentity("persisted");
    await fresh(factory);
    expect(await store.loadStoredIdentity()).toMatchObject({ privateMaterial: "persisted" });
  });
});

describe("preferences", () => {
  it("returns the defaults before anything was saved", async () => {
    expect(await store.loadLocalPreferences()).toEqual({ schemaVersion: 1, volumesByUid: {} });
  });

  it("merges a save into what is stored, field by field", async () => {
    await store.saveLocalPreferences({ schemaVersion: 1, theme: "dark", outputVolume: 0.5 });
    await store.saveLocalPreferences({ schemaVersion: 1, outputVolume: 0.8, lastNickname: "Ann" });
    expect(await store.loadLocalPreferences()).toMatchObject({ theme: "dark", outputVolume: 0.8, lastNickname: "Ann" });
  });

  it("merges the volumes by UID instead of replacing them", async () => {
    await store.saveLocalPreferences({ schemaVersion: 1, volumesByUid: { a: 1, b: 2 } });
    await store.saveLocalPreferences({ schemaVersion: 1, volumesByUid: { b: 3, c: 4 } });
    expect((await store.loadLocalPreferences()).volumesByUid).toEqual({ a: 1, b: 3, c: 4 });
  });

  it("keeps a volume of 0 (a muted member) rather than treating it as unset", async () => {
    await store.saveLocalPreferences({ schemaVersion: 1, volumesByUid: { uid: 0 } });
    expect((await store.loadLocalPreferences()).volumesByUid).toEqual({ uid: 0 });
  });

  it("ignores a stored record with another schema version", async () => {
    await store.saveLocalPreferences({ schemaVersion: 1, theme: "dark" });
    await putRaw("preferences", { id: "singleton", schemaVersion: 2, theme: "light" });
    expect(await store.loadLocalPreferences()).toEqual({ schemaVersion: 1, volumesByUid: {} });
  });
});

describe("favorites", () => {
  it("is empty at first", async () => {
    expect(await store.listFavorites()).toEqual([]);
  });

  it("lists favorites sorted by label", async () => {
    await store.saveFavorite(favorite("1", "Charlie"));
    await store.saveFavorite(favorite("2", "alpha"));
    await store.saveFavorite(favorite("3", "Bravo"));
    expect((await store.listFavorites()).map((item) => item.label)).toEqual(["alpha", "Bravo", "Charlie"]);
  });

  it("saving an existing id replaces it", async () => {
    await store.saveFavorite({ ...favorite("1", "Old"), nickname: "Ann" });
    await store.saveFavorite(favorite("1", "New"));
    expect(await store.listFavorites()).toEqual([favorite("1", "New")]);
  });

  it("removes one favorite and leaves the others, and an unknown id is fine", async () => {
    await store.saveFavorite(favorite("1"));
    await store.saveFavorite(favorite("2"));
    await store.removeFavorite("1");
    await store.removeFavorite("nope");
    expect((await store.listFavorites()).map((item) => item.id)).toEqual(["2"]);
  });
});

describe("recent servers", () => {
  it("lists the newest connection first", async () => {
    await store.recordRecentServer(recent("old", 100));
    await store.recordRecentServer(recent("new", 300));
    await store.recordRecentServer(recent("mid", 200));
    expect((await store.listRecentServers()).map((item) => item.id)).toEqual(["new", "mid", "old"]);
  });

  it("records a server once: the same id is updated", async () => {
    await store.recordRecentServer(recent("a", 100));
    await store.recordRecentServer({ ...recent("a", 400), nickname: "Ann" });
    expect(await store.listRecentServers()).toEqual([{ ...recent("a", 400), nickname: "Ann" }]);
  });

  it("keeps the 10 newest and deletes the rest from storage", async () => {
    for (let index = 1; index <= 13; index++) await store.recordRecentServer(recent(`s${index}`, index));
    const listed = await store.listRecentServers();
    expect(listed).toHaveLength(10);
    expect(listed[0].id).toBe("s13");
    expect(listed[9].id).toBe("s4");
    expect(await countRaw("recent")).toBe(10);
  });

  it("caps what it lists at 10 even if more were stored", async () => {
    await store.listRecentServers(); // opens the database and creates the stores
    for (let index = 1; index <= 12; index++) await putRaw("recent", recent(`s${index}`, index));
    expect(await store.listRecentServers()).toHaveLength(10);
  });
});

describe("clearLocalData", () => {
  it("empties all four stores", async () => {
    await store.saveStoredIdentity("x");
    await store.saveLocalPreferences({ schemaVersion: 1, theme: "dark", volumesByUid: { a: 1 } });
    await store.saveFavorite(favorite("1"));
    await store.recordRecentServer(recent("r", 1));
    await store.clearLocalData();
    expect(await store.loadStoredIdentity()).toBeNull();
    expect(await store.loadLocalPreferences()).toEqual({ schemaVersion: 1, volumesByUid: {} });
    expect(await store.listFavorites()).toEqual([]);
    expect(await store.listRecentServers()).toEqual([]);
  });
});

// Private windows and blocked storage: nothing may throw, everything answers empty.
describe("when IndexedDB is unavailable", () => {
  beforeEach(() => fresh(null));

  it("reports itself as unavailable", () => {
    expect(store.isLocalPersistenceAvailable()).toBe(false);
  });

  it("reads answer empty and writes report failure or do nothing", async () => {
    expect(await store.loadStoredIdentity()).toBeNull();
    expect(await store.saveStoredIdentity("x")).toBe(false);
    await expect(store.removeStoredIdentity()).resolves.toBeUndefined();
    expect(await store.loadLocalPreferences()).toEqual({ schemaVersion: 1, volumesByUid: {} });
    await expect(store.saveLocalPreferences({ schemaVersion: 1, theme: "dark" })).resolves.toBeUndefined();
    expect(await store.listFavorites()).toEqual([]);
    await expect(store.saveFavorite(favorite("1"))).resolves.toBeUndefined();
    await expect(store.removeFavorite("1")).resolves.toBeUndefined();
    expect(await store.listRecentServers()).toEqual([]);
    await expect(store.recordRecentServer(recent("a", 1))).resolves.toBeUndefined();
    await expect(store.clearLocalData()).resolves.toBeUndefined();
  });
});

describe("when opening the database fails", () => {
  /** An IndexedDB whose open() answers with an error event, as a blocked profile does. */
  function failingFactory(): IDBFactory {
    return {
      open() {
        const request: Record<string, unknown> = { error: new DOMException("blocked", "SecurityError") };
        queueMicrotask(() => (request.onerror as (() => void) | undefined)?.());
        return request;
      },
    } as unknown as IDBFactory;
  }

  it("answers empty and reports the failed save", async () => {
    await fresh(failingFactory());
    expect(store.isLocalPersistenceAvailable()).toBe(true);
    expect(await store.loadStoredIdentity()).toBeNull();
    expect(await store.saveStoredIdentity("x")).toBe(false);
    expect(await store.listFavorites()).toEqual([]);
    expect(await store.loadLocalPreferences()).toEqual({ schemaVersion: 1, volumesByUid: {} });
  });

  it("does not remember the failure: the next call opens the database again", async () => {
    await fresh(failingFactory());
    expect(await store.saveStoredIdentity("x")).toBe(false);
    vi.stubGlobal("indexedDB", new IDBFactory());
    expect(await store.saveStoredIdentity("x")).toBe(true);
    expect(await store.loadStoredIdentity()).toMatchObject({ privateMaterial: "x" });
  });
});

// Direct access to the database the module opened, for what the API cannot do.
// Call a store function first: opening an unknown database here would create it without stores.
function rawDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("webspeak-local", 1);
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

async function putRaw(storeName: string, value: unknown): Promise<void> {
  const database = await rawDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function countRaw(storeName: string): Promise<number> {
  const database = await rawDatabase();
  const count = await new Promise<number>((resolve, reject) => {
    const request = database.transaction(storeName).objectStore(storeName).count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return count;
}

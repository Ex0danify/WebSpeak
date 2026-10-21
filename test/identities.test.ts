import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { identityFromString, ts3Uid } from "../src/lib/teamspeak/index.js";
import { IdentityStore, serverUidOf, storageStateFor } from "../e2e/real/identities";

const dirs: string[] = [];
function tempStore(): { store: IdentityStore; file: string } {
  const dir = mkdtempSync(join(tmpdir(), "webspeak-identities-"));
  dirs.push(dir);
  const file = join(dir, "identities.json");
  return { store: new IdentityStore(file), file };
}
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe("seeded identities", () => {
  it("keeps the same identity for an index across stores that read the same file", () => {
    const { store, file } = tempStore();
    const first = store.get(2);
    expect(new IdentityStore(file).get(2)).toEqual(first);
  });

  it("gives every index its own identity and UID, and does not change earlier ones when more are made", () => {
    const { store } = tempStore();
    const zero = store.get(0);
    const all = [zero, store.get(1), store.get(2)];
    expect(new Set(all.map((i) => i.privateMaterial)).size).toBe(3);
    expect(new Set(all.map((i) => i.uid)).size).toBe(3);
    expect(store.get(0)).toEqual(zero);
  });

  it("makes identities the server accepts: they parse and reach security level 8", () => {
    const { store } = tempStore();
    expect(identityFromString(store.get(0).privateMaterial).securityLevel()).toBeGreaterThanOrEqual(8);
  });

  it("names them the way TeamSpeak 6 does, SHA-256 of the public key, which is not the TeamSpeak 3 SHA-1 UID", () => {
    const { store } = tempStore();
    const { privateMaterial, uid } = store.get(0);
    const publicKey = identityFromString(privateMaterial).publicKeyBase64;
    expect(uid).toBe(serverUidOf(publicKey));
    expect(uid).toHaveLength(44);
    expect(ts3Uid(publicKey)).toHaveLength(28);
    expect(ts3Uid(publicKey)).not.toBe(uid);
  });

  it("reproduces the UID a real TeamSpeak 6 server reported for a known public key", () => {
    // Measured on teamspeak6-server 6.0.0-beta13.1: the client database listed this UID for the identity
    // with this public key. SHA-1 of the same key is jLjx5pIMJszva8Z6CM51YeSQyNI=.
    const publicKey = "ME0DAgcAAgEgAiEAht8kWseAlIxVe0M9FD3buO6Dt3wn1tKDlmcP81X0vQ0CIQCoeJwd6WkaZ40RT/vKF3J/t6PRmKmEUyPwqg9qvnrG0Q==";
    expect(serverUidOf(publicKey)).toBe("5xNaN5EbsO/Ccg929pS4u2awXacScXRizfuG/oSlNX8=");
    expect(ts3Uid(publicKey)).toBe("jLjx5pIMJszva8Z6CM51YeSQyNI=");
  });

  it.skipIf(process.platform === "win32")("keeps the private keys readable by the owner only", () => {
    const { store, file } = tempStore();
    store.get(0);
    expect(statSync(file).mode & 0o077).toBe(0);
  });

  it.each([-1, 1.5, Number.NaN])("refuses index %s", (index) => {
    expect(() => tempStore().store.get(index)).toThrow(/index/);
  });
});

describe("storage state of a returning user", () => {
  it("turns remember-identity on and stores the identity as the client saves it, in all four stores", () => {
    const { store } = tempStore();
    const state = storageStateFor(1, "http://127.0.0.1:1234", store);
    const [origin] = state.origins;
    expect(origin.origin).toBe("http://127.0.0.1:1234");
    expect(origin.localStorage).toEqual([{ name: "webspeak:remember-identity", value: "1" }]);
    const [database] = origin.indexedDB as {
      name: string;
      version: number;
      stores: { name: string; keyPath: string; records: { value: Record<string, unknown> }[] }[];
    }[];
    expect(database).toMatchObject({ name: "webspeak-local", version: 1 });
    expect(database.stores.map((s) => s.name).sort()).toEqual(["favorites", "identities", "preferences", "recent"]);
    const identities = database.stores.find((s) => s.name === "identities")!;
    expect(identities.keyPath).toBe("id");
    expect(identities.records).toHaveLength(1);
    expect(identities.records[0].value).toMatchObject({ id: "current", privateMaterial: store.get(1).privateMaterial });
    expect(database.stores.filter((s) => s.name !== "identities").every((s) => s.records.length === 0)).toBe(true);
  });
});

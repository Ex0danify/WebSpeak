import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { credential, invite, mkdirSyncFor, settings, useDatabaseFixture } from "../../../test/support/database.js";
import { DATABASE_SCHEMA_VERSION } from "./database.js";

const fx = useDatabaseFixture();

describe("managed invites", () => {
  it("creates an unused, unrevoked invite and lists it", () => {
    const database = fx.open();
    const created = database.createManagedInvite(invite("invite-1", { channel: "Lobby", maxUses: 3 }));
    expect(created).toMatchObject({ id: "invite-1", channel: "Lobby", maxUses: 3, useCount: 0, revokedAt: null });
    expect(database.listManagedInvites()).toEqual([created]);
  });

  it("lists the newest invite first", () => {
    vi.useFakeTimers();
    const database = fx.open();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    database.createManagedInvite(invite("invite-old", { expiresAt: "2030-01-01T00:00:00.000Z" }));
    vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
    database.createManagedInvite(invite("invite-new", { expiresAt: "2030-01-01T00:00:00.000Z" }));
    expect(database.listManagedInvites().map((entry) => entry.id)).toEqual(["invite-new", "invite-old"]);
  });

  it("refuses two invites with the same token hash", () => {
    const database = fx.open();
    database.createManagedInvite(invite("invite-1", { tokenHash: "same" }));
    expect(() => database.createManagedInvite(invite("invite-2", { tokenHash: "same" }))).toThrow();
    expect(database.listManagedInvites()).toHaveLength(1);
  });

  it("consumes a single-use invite once, then refuses it", () => {
    const database = fx.open();
    database.createManagedInvite(invite("invite-1", { maxUses: 1 }));
    expect(database.consumeManagedInvite("hash-invite-1")).toMatchObject({ id: "invite-1", useCount: 1 });
    expect(database.consumeManagedInvite("hash-invite-1")).toBeNull();
    expect(database.listManagedInvites()[0]?.useCount).toBe(1);
  });

  it("counts each use up to maxUses", () => {
    const database = fx.open();
    database.createManagedInvite(invite("invite-1", { maxUses: 3 }));
    expect([1, 2, 3].map(() => database.consumeManagedInvite("hash-invite-1")?.useCount)).toEqual([1, 2, 3]);
    expect(database.consumeManagedInvite("hash-invite-1")).toBeNull();
  });

  it("treats maxUses 0 as unlimited", () => {
    const database = fx.open();
    database.createManagedInvite(invite("invite-1", { maxUses: 0 }));
    for (let use = 1; use <= 25; use += 1) expect(database.consumeManagedInvite("hash-invite-1")?.useCount).toBe(use);
  });

  it("refuses an expired invite, judged at the moment given", () => {
    const database = fx.open();
    database.createManagedInvite(invite("invite-1", { maxUses: 0, expiresAt: "2030-01-01T00:00:00.000Z" }));
    const expiry = Date.parse("2030-01-01T00:00:00.000Z");
    expect(database.consumeManagedInvite("hash-invite-1", expiry - 1)).not.toBeNull();
    expect(database.consumeManagedInvite("hash-invite-1", expiry)).toBeNull();
    expect(database.consumeManagedInvite("hash-invite-1", expiry + 1)).toBeNull();
  });

  it("refuses a revoked invite and does not spend a use on a refusal", () => {
    const database = fx.open();
    database.createManagedInvite(invite("invite-1", { maxUses: 2 }));
    expect(database.revokeManagedInvite("invite-1")).toBe(true);
    expect(database.consumeManagedInvite("hash-invite-1")).toBeNull();
    expect(database.listManagedInvites()[0]).toMatchObject({ useCount: 0 });
    expect(database.listManagedInvites()[0]?.revokedAt).not.toBeNull();
  });

  it("revokes once: a second revoke and an unknown id report false and keep the first timestamp", () => {
    vi.useFakeTimers();
    const database = fx.open();
    vi.setSystemTime(new Date("2026-03-01T10:00:00Z"));
    database.createManagedInvite(invite("invite-1", { expiresAt: "2030-01-01T00:00:00.000Z" }));
    expect(database.revokeManagedInvite("invite-1")).toBe(true);
    vi.setSystemTime(new Date("2026-03-02T10:00:00Z"));
    expect(database.revokeManagedInvite("invite-1")).toBe(false);
    expect(database.revokeManagedInvite("invite-missing")).toBe(false);
    expect(database.listManagedInvites()[0]?.revokedAt).toBe("2026-03-01T10:00:00.000Z");
  });

  it("returns null for an unknown token hash", () => {
    expect(fx.open().consumeManagedInvite("nope")).toBeNull();
  });

  it("stores the encrypted server password and target of the invite as given", () => {
    const database = fx.open();
    database.createManagedInvite(invite("invite-1", { serverPasswordEncrypted: "enc:pw", targetHost: "::1", targetPort: 1234 }));
    expect(database.consumeManagedInvite("hash-invite-1")).toMatchObject({
      serverPasswordEncrypted: "enc:pw",
      targetHost: "::1",
      targetPort: 1234,
    });
  });
});

describe("metadata and visitor counter", () => {
  it("reads a missing key as null and overwrites an existing one", () => {
    const database = fx.open();
    expect(database.getMeta("k")).toBeNull();
    database.setMeta("k", "1");
    database.setMeta("k", "2");
    expect(database.getMeta("k")).toBe("2");
  });

  it("counts visitors from 1 and persists the counter across a reopen", () => {
    const database = fx.open();
    expect(database.getVisitorCount()).toBe(0);
    expect([database.nextVisitorNumber(), database.nextVisitorNumber(), database.nextVisitorNumber()]).toEqual([1, 2, 3]);
    expect(database.getVisitorCount()).toBe(3);
    database.close();
    expect(fx.open().nextVisitorNumber()).toBe(4);
  });

  it("restarts at 1 when the stored counter is corrupt, negative or at the safe-integer limit", () => {
    const database = fx.open();
    for (const bad of ["abc", "-5", "", String(Number.MAX_SAFE_INTEGER)]) {
      database.setMeta("visitor_count", bad);
      expect(database.nextVisitorNumber(), JSON.stringify(bad)).toBe(1);
    }
  });

  it("reads a corrupt or negative counter as 0", () => {
    const database = fx.open();
    for (const bad of ["abc", "-5", ""]) {
      database.setMeta("visitor_count", bad);
      expect(database.getVisitorCount(), JSON.stringify(bad)).toBe(0);
    }
  });
});

describe("audit log", () => {
  it("returns the newest entries first with their timestamps", () => {
    const database = fx.open();
    database.addAudit("FIRST");
    database.addAudit("SECOND", { id: 7 });
    const entries = database.listAudit({ limit: 8, offset: 0 }).events;
    expect(entries.map((entry) => entry.event)).toEqual(["SECOND", "FIRST"]);
    expect(Date.parse(entries[0]!.createdAt)).not.toBeNaN();
  });

  it("stores the details as JSON, defaulting to an empty object", () => {
    const database = fx.open();
    database.addAudit("A");
    database.addAudit("B", { id: 7, nested: { ok: true } });
    const raw = new DatabaseSync(fx.path);
    try {
      const rows = raw.prepare("SELECT details_json FROM audit_events ORDER BY id").all() as Array<{ details_json: string }>;
      expect(rows.map((row) => JSON.parse(row.details_json))).toEqual([{}, { id: 7, nested: { ok: true } }]);
    } finally {
      raw.close();
    }
  });

  it("clamps the limit to 1..50 and floors fractions", () => {
    const database = fx.open();
    for (let index = 0; index < 60; index += 1) database.addAudit(`E${index}`);
    expect(database.listAudit({ limit: 8, offset: 0 }).events).toHaveLength(8);
    expect(database.listAudit({ limit: 0, offset: 0 }).events).toHaveLength(1);
    expect(database.listAudit({ limit: -10, offset: 0 }).events).toHaveLength(1);
    expect(database.listAudit({ limit: 3.9, offset: 0 }).events).toHaveLength(3);
    expect(database.listAudit({ limit: 1000, offset: 0 }).events).toHaveLength(60);
    expect(database.listAudit({ limit: 1, offset: 0 }).events[0]?.event).toBe("E59");
  });
});

describe("backup export", () => {
  it("produces a SQLite file that opens as a full copy of the current state", () => {
    const database = fx.open();
    database.initializeAdmin(credential, settings());
    database.createManagedInvite(invite("invite-1", { maxUses: 2 }));
    database.replaceRelayNodes([{ id: "relay-a", name: "A", enabled: true, host: "a.example.org", port: 39087, tokenEncrypted: "enc" }]);
    database.setMeta("visitor_count", "9");
    database.addAudit("CUSTOM", { x: 1 });

    const bytes = database.exportBackup();
    expect(bytes.subarray(0, 15).toString("latin1")).toBe("SQLite format 3");

    const restoredPath = join(fx.dir, "restored", "webspeak.db");
    mkdirSyncFor(restoredPath);
    writeFileSync(restoredPath, bytes);
    const restored = fx.open(restoredPath);
    expect(restored.schemaVersion).toBe(DATABASE_SCHEMA_VERSION);
    expect(restored.getAdminCredential()).toEqual(credential);
    expect(restored.getSettings()).toEqual(database.getSettings());
    expect(restored.listManagedInvites()).toEqual(database.listManagedInvites());
    expect(restored.listRelayNodes()).toEqual(database.listRelayNodes());
    expect(restored.getVisitorCount()).toBe(9);
    expect(restored.listAudit({ limit: 50, offset: 0 }).events).toEqual(database.listAudit({ limit: 50, offset: 0 }).events);
  });

  it("leaves no temporary export file next to the database", () => {
    const database = fx.open();
    database.exportBackup();
    database.exportBackup();
    expect(readdirSync(fx.dir).filter((name) => name.includes(".export-"))).toEqual([]);
  });
});

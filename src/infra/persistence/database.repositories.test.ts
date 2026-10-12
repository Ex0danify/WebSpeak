import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { credential, invite, settings } from "../../../test/support/database.js";
import { AdminCredentialRepository } from "./adminCredentialRepository.js";
import { AuditRepository } from "./auditRepository.js";
import { runMigrations } from "./databaseMigrations.js";
import { ManagedInviteRepository } from "./managedInviteRepository.js";
import { MetaRepository } from "./metaRepository.js";
import type { PersistenceContext } from "./persistenceContext.js";
import { RelayNodeRepository } from "./relayNodeRepository.js";
import { SettingsRepository } from "./settingsRepository.js";

let context: PersistenceContext;

beforeEach(() => {
  const database = new DatabaseSync(":memory:");
  const transaction = (action: () => void) => {
    database.exec("BEGIN IMMEDIATE");
    try {
      action();
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  };
  runMigrations(database, 0, transaction);
  context = { database, transaction };
});

describe("AdminCredentialRepository", () => {
  it("stores, reads and replaces the single credential row", () => {
    const repo = new AdminCredentialRepository(context);
    expect(repo.has()).toBe(false);
    expect(repo.get()).toBeNull();
    repo.insert(credential, "2026-01-01T00:00:00.000Z");
    expect(repo.has()).toBe(true);
    expect(repo.get()).toEqual(credential);
    repo.update({ ...credential, hash: "bmV3" });
    expect(repo.get()?.hash).toBe("bmV3");
  });
});

describe("SettingsRepository", () => {
  it("writes and reads settings, mapping flags and unknown enums", () => {
    const repo = new SettingsRepository(context);
    repo.write(settings({ siteName: "Repo", webRtcEnabled: false }), "2026-01-01T00:00:00.000Z");
    expect(repo.get()).toMatchObject({
      siteName: "Repo",
      accessMode: "open",
      webRtcEnabled: false,
      relayEnabled: true,
      detectedProtocol: null,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("records and clears the connection test result", () => {
    const repo = new SettingsRepository(context);
    repo.write(settings(), "2026-01-01T00:00:00.000Z");
    repo.recordConnectionTest({ protocol: "ts6", latencyMs: 12, error: null });
    expect(repo.get()).toMatchObject({ detectedProtocol: "ts6", lastTestLatencyMs: 12, lastTestError: null });
    expect(repo.get().lastTestAt).not.toBeNull();
    repo.clearConnectionTest();
    expect(repo.get()).toMatchObject({ detectedProtocol: null, lastTestAt: null, lastTestLatencyMs: null });
  });
});

describe("RelayNodeRepository", () => {
  it("replaces the whole list and orders by creation time", () => {
    const repo = new RelayNodeRepository(context);
    repo.replace([
      { id: "b", name: "B", enabled: true, host: "b.example", port: 1, tokenEncrypted: null, createdAt: "2026-01-02T00:00:00.000Z" },
      { id: "a", name: "A", enabled: false, host: "a.example", port: 2, tokenEncrypted: "enc", createdAt: "2026-01-01T00:00:00.000Z" },
    ]);
    expect(repo.list().map((node) => [node.id, node.enabled])).toEqual([
      ["a", false],
      ["b", true],
    ]);
    repo.replace([]);
    expect(repo.list()).toEqual([]);
  });
});

describe("ManagedInviteRepository", () => {
  it("creates, lists, consumes up to maxUses and revokes", () => {
    const repo = new ManagedInviteRepository(context);
    const created = repo.create(invite("one", { maxUses: 1 }));
    expect(created).toMatchObject({ id: "one", useCount: 0, revokedAt: null });
    expect(repo.list().map((record) => record.id)).toEqual(["one"]);
    expect(repo.consume("hash-one")).toMatchObject({ id: "one", useCount: 1 });
    expect(repo.consume("hash-one")).toBeNull();
    expect(repo.revoke("one")).toBe(true);
    expect(repo.revoke("one")).toBe(false);
    expect(repo.consume("nope")).toBeNull();
  });
});

describe("AuditRepository", () => {
  it("returns the newest entries first and clamps the limit", () => {
    const repo = new AuditRepository(context);
    for (let i = 0; i < 60; i += 1) repo.insert(`E${i}`, { i }, "2026-01-01T00:00:00.000Z");
    expect(repo.recent(2).map((entry) => entry.event)).toEqual(["E59", "E58"]);
    expect(repo.recent(1000)).toHaveLength(50);
    expect(repo.recent(0)).toHaveLength(1);
  });
});

describe("MetaRepository", () => {
  it("stores values and counts visitors, restarting from 1 on a corrupt counter", () => {
    const repo = new MetaRepository(context);
    expect(repo.get("k")).toBeNull();
    repo.set("k", "v");
    repo.set("k", "w");
    expect(repo.get("k")).toBe("w");
    expect(repo.getVisitorCount()).toBe(0);
    expect(repo.nextVisitorNumber()).toBe(1);
    expect(repo.nextVisitorNumber()).toBe(2);
    expect(repo.getVisitorCount()).toBe(2);
    repo.set("visitor_count", "garbage");
    expect(repo.getVisitorCount()).toBe(0);
    expect(repo.nextVisitorNumber()).toBe(1);
  });
});

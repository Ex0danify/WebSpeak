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
import { ServerRepository } from "./serverRepository.js";
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
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });
});

describe("ServerRepository", () => {
  const server = (id: string, name = id) => ({ id, name, host: `${id}.example.org`, port: 9987, passwordEncrypted: null });

  it("lists in insertion order and appends each new server last", () => {
    const repo = new ServerRepository(context);
    const before = repo.list().length;
    repo.insert(server("one"), "2026-01-01T00:00:00.000Z");
    repo.insert(server("two"), "2026-01-01T00:00:00.000Z");
    expect(
      repo
        .list()
        .slice(before)
        .map((entry) => entry.id),
    ).toEqual(["one", "two"]);
    expect(repo.get("two")).toMatchObject({ host: "two.example.org", lastTestAt: null });
    expect(repo.get("missing")).toBeNull();
  });

  it("keeps the test result on a rename and clears it when asked", () => {
    const repo = new ServerRepository(context);
    repo.insert(server("one"), "2026-01-01T00:00:00.000Z");
    repo.recordTest("one", { latencyMs: 12, error: null });
    repo.update({ ...server("one"), name: "Renamed" }, "2026-01-02T00:00:00.000Z", false);
    expect(repo.get("one")).toMatchObject({ name: "Renamed", lastTestLatencyMs: 12 });
    expect(repo.get("one")!.lastTestAt).not.toBeNull();
    repo.update({ ...server("one"), host: "moved.example.org" }, "2026-01-03T00:00:00.000Z", true);
    expect(repo.get("one")).toMatchObject({ host: "moved.example.org", lastTestAt: null, lastTestLatencyMs: null, lastTestError: null });
  });

  it("records a failed test and deletes", () => {
    const repo = new ServerRepository(context);
    repo.insert(server("one"), "2026-01-01T00:00:00.000Z");
    repo.recordTest("one", { latencyMs: null, error: "TIMEOUT" });
    expect(repo.get("one")).toMatchObject({ lastTestLatencyMs: null, lastTestError: "TIMEOUT" });
    expect(repo.delete("one")).toBe(true);
    expect(repo.delete("one")).toBe(false);
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
  const at = (day: number) => `2026-01-${String(day).padStart(2, "0")}T00:00:00.000Z`;

  it("returns the newest entries first and clamps the page", () => {
    const repo = new AuditRepository(context);
    for (let i = 0; i < 120; i += 1) repo.insert(`E${i}`, { i }, at(1));
    expect(repo.list({ limit: 2, offset: 0 }).events.map((entry) => entry.event)).toEqual(["E119", "E118"]);
    expect(repo.list({ limit: 2, offset: 2 }).events.map((entry) => entry.event)).toEqual(["E117", "E116"]);
    expect(repo.list({ limit: 1000, offset: 0 })).toMatchObject({ total: 120 });
    expect(repo.list({ limit: 1000, offset: 0 }).events).toHaveLength(100);
    expect(repo.list({ limit: 0, offset: -5 }).events).toHaveLength(1);
  });

  it("files a row by its event and keeps the details", () => {
    const repo = new AuditRepository(context);
    repo.insert("ADMIN_LOGIN_FAILED", { reason: "x" }, at(1));
    repo.insert("SERVER_UNAVAILABLE", {}, at(2));
    repo.insert("UNKNOWN_EVENT", {}, at(3));
    expect(repo.list({ limit: 10, offset: 0 }).events).toMatchObject([
      { event: "UNKNOWN_EVENT", category: "system", severity: "info" },
      { event: "SERVER_UNAVAILABLE", category: "availability", severity: "error" },
      { event: "ADMIN_LOGIN_FAILED", category: "auth", severity: "warning", details: { reason: "x" } },
    ]);
  });

  it("filters by category, severity, time and text, and counts what matches", () => {
    const repo = new AuditRepository(context);
    repo.insert("ADMIN_LOGIN_FAILED", {}, at(1));
    repo.insert("ADMIN_LOGIN_SUCCEEDED", {}, at(2));
    repo.insert("SERVER_ADDED", { name: "Main_100%" }, at(3));
    repo.insert("SERVER_UNAVAILABLE", { name: "Main" }, at(4));
    const names = (query: Partial<Parameters<AuditRepository["list"]>[0]>) =>
      repo.list({ limit: 10, offset: 0, ...query }).events.map((entry) => entry.event);
    expect(names({ categories: ["auth"] })).toEqual(["ADMIN_LOGIN_SUCCEEDED", "ADMIN_LOGIN_FAILED"]);
    expect(names({ categories: ["auth", "availability"] })).toHaveLength(3);
    expect(names({ categories: [] })).toEqual([]);
    expect(names({ severities: ["warning", "error"] })).toEqual(["SERVER_UNAVAILABLE", "ADMIN_LOGIN_FAILED"]);
    expect(names({ severities: ["error"] })).toEqual(["SERVER_UNAVAILABLE"]);
    expect(names({ severities: ["warning"] })).toEqual(["ADMIN_LOGIN_FAILED"]);
    expect(names({ severities: [] })).toEqual([]);
    expect(names({ since: at(3) })).toEqual(["SERVER_UNAVAILABLE", "SERVER_ADDED"]);
    expect(names({ search: "login failed" })).toEqual(["ADMIN_LOGIN_FAILED"]);
    expect(names({ search: "MAIN" })).toEqual(["SERVER_UNAVAILABLE", "SERVER_ADDED"]);
    expect(names({ search: "100%" })).toEqual(["SERVER_ADDED"]);
    expect(names({ search: "n_1" })).toEqual(["SERVER_ADDED"]);
    expect(names({ search: "%" })).toEqual(["SERVER_ADDED"]);
    expect(repo.list({ limit: 1, offset: 0, categories: ["auth"] })).toMatchObject({ total: 2 });
  });

  it("reads details that are not an object as empty", () => {
    const repo = new AuditRepository(context);
    repo.insert("E", {}, at(1));
    (context.database as unknown as { exec(sql: string): void }).exec("UPDATE audit_events SET details_json = '[1]'");
    expect(repo.list({ limit: 1, offset: 0 }).events[0]?.details).toEqual({});
    (context.database as unknown as { exec(sql: string): void }).exec("UPDATE audit_events SET details_json = 'nope'");
    expect(repo.list({ limit: 1, offset: 0 }).events[0]?.details).toEqual({});
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

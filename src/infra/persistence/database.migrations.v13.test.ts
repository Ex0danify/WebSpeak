import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { mkdirSyncFor, useDatabaseFixture } from "../../../test/support/database.js";
import { createSchema12Database } from "../../../test/support/schema12Database.js";
import { DATABASE_SCHEMA_VERSION } from "./database.js";

const fx = useDatabaseFixture();

function rows(file: string, sql: string): unknown[] {
  const raw = new DatabaseSync(file, { readOnly: true });
  try {
    return raw.prepare(sql).all();
  } finally {
    raw.close();
  }
}

const AUDIT_OBJECTS = "SELECT type, name, sql FROM sqlite_master WHERE tbl_name = 'audit_events' ORDER BY type, name";

describe("schema 13 migration (the event log stores category and severity)", () => {
  it("rebuilds the table to the same DDL as a fresh database", () => {
    createSchema12Database(fx.path);
    fx.open().close();
    const fresh = join(fx.dir, "fresh", "webspeak.db");
    mkdirSyncFor(fresh);
    fx.open(fresh).close();
    expect(rows(fx.path, AUDIT_OBJECTS)).toEqual(rows(fresh, AUDIT_OBJECTS));
    expect(rows(fx.path, "PRAGMA user_version")).toEqual([{ user_version: DATABASE_SCHEMA_VERSION }]);
  });

  it("files the old rows by event and drops the logged connection tests", () => {
    createSchema12Database(fx.path);
    fx.open().close();
    expect(rows(fx.path, "SELECT event, category, severity, created_at FROM audit_events ORDER BY id")).toEqual([
      { event: "ADMIN_INITIALIZED", category: "system", severity: "info", created_at: "2024-01-01T00:00:00.000Z" },
      { event: "ADMIN_LOGIN_FAILED", category: "auth", severity: "warning", created_at: "2024-01-03T00:00:00.000Z" },
      { event: "SETTINGS_CHANGED", category: "config", severity: "info", created_at: "2024-01-04T00:00:00.000Z" },
      { event: "INVITE_CREATED", category: "invites", severity: "info", created_at: "2024-01-06T00:00:00.000Z" },
      { event: "ADMIN_PASSWORD_RESET", category: "auth", severity: "warning", created_at: "2024-01-07T00:00:00.000Z" },
      { event: "SOMETHING_ELSE", category: "system", severity: "info", created_at: "2024-01-08T00:00:00.000Z" },
    ]);
  });

  it("keeps the ids and the details, and leaves every other table byte-identical", () => {
    createSchema12Database(fx.path);
    const tables = ["metadata", "admin_credentials", "ts_servers", "welcome_texts", "relay_nodes", "settings", "managed_invites"];
    const dump = () =>
      tables.map((table) =>
        rows(
          fx.path,
          table === "settings"
            ? `SELECT id, site_name, access_mode, updated_at, webrtc_enabled, webrtc_udp_start, webrtc_udp_end, identity_mint_max_level, identity_mint_concurrency, identity_mint_queue_depth FROM settings`
            : `SELECT * FROM ${table}`,
        ),
      );
    const before = dump();
    fx.open().close();
    expect(dump()).toEqual(before);
    expect(rows(fx.path, "SELECT id, details_json FROM audit_events WHERE event = 'INVITE_CREATED'")).toEqual([
      { id: 6, details_json: '{"id":"invite-1"}' },
    ]);
  });

  it("refuses a category or severity it does not know", () => {
    createSchema12Database(fx.path);
    fx.open().close();
    const check = new DatabaseSync(fx.path);
    try {
      const insert = (category: string, severity: string) =>
        check
          .prepare("INSERT INTO audit_events (event, category, severity, details_json, created_at) VALUES ('E', ?, ?, '{}', 'x')")
          .run(category, severity);
      expect(() => insert("nope", "info")).toThrow(/CHECK/);
      expect(() => insert("auth", "nope")).toThrow(/CHECK/);
      expect(() => insert("auth", "info")).not.toThrow();
    } finally {
      check.close();
    }
  });
});

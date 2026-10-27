import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { mkdirSyncFor, useDatabaseFixture } from "../../../test/support/database.js";
import { createSchema13Database } from "../../../test/support/schema13Database.js";
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

const OBJECTS = (table: string) => `SELECT type, name, sql FROM sqlite_master WHERE tbl_name = '${table}' ORDER BY type, name`;

describe("schema 14 migration (sessions, retention settings)", () => {
  it("ends at the objects of a fresh database for the event log and the connection records", () => {
    createSchema13Database(fx.path);
    fx.open().close();
    const fresh = join(fx.dir, "fresh", "webspeak.db");
    mkdirSyncFor(fresh);
    fx.open(fresh).close();
    for (const table of ["audit_events", "connection_records"]) expect(rows(fx.path, OBJECTS(table))).toEqual(rows(fresh, OBJECTS(table)));
    expect(rows(fx.path, "PRAGMA user_version")).toEqual([{ user_version: DATABASE_SCHEMA_VERSION }]);
  });

  it("keeps the event log rows and their ids, and takes the new category", () => {
    createSchema13Database(fx.path);
    const before = rows(fx.path, "SELECT * FROM audit_events ORDER BY id");
    const database = fx.open();
    expect(rows(fx.path, "SELECT * FROM audit_events ORDER BY id")).toEqual(before);
    database.addAudit("SESSION_CONNECTED", { id: "w-1" });
    expect(database.listAudit({ limit: 1, offset: 0 }).events[0]).toMatchObject({ id: 5, category: "sessions", severity: "info" });
  });

  it("gives the existing settings row the default retention", () => {
    createSchema13Database(fx.path);
    const database = fx.open();
    expect(database.getSettings()).toMatchObject({
      siteName: "Eleven",
      retention: { eventLog: { days: 90, maxRows: 5000 }, connections: { days: 30, maxRows: 10000 } },
    });
  });

  it("refuses retention values outside the bounds", () => {
    createSchema13Database(fx.path);
    fx.open().close();
    const raw = new DatabaseSync(fx.path);
    try {
      expect(() => raw.exec("UPDATE settings SET event_log_retention_days = 0")).toThrow();
      expect(() => raw.exec("UPDATE settings SET event_log_max_rows = 99")).toThrow();
      expect(() => raw.exec("UPDATE settings SET connection_retention_days = 366")).toThrow();
      expect(() => raw.exec("UPDATE settings SET connection_max_rows = 999999999999")).toThrow();
    } finally {
      raw.close();
    }
  });

  it("leaves every other table byte-identical", () => {
    createSchema13Database(fx.path);
    const tables = ["metadata", "admin_credentials", "ts_servers", "welcome_texts", "relay_nodes", "managed_invites"];
    const dump = () => tables.map((table) => rows(fx.path, `SELECT * FROM ${table}`));
    const before = dump();
    fx.open().close();
    expect(dump()).toEqual(before);
  });
});

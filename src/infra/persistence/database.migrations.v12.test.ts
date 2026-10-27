import { existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { mkdirSyncFor, useDatabaseFixture } from "../../../test/support/database.js";
import { createSchema11Database } from "../../../test/support/schema11Database.js";
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

const INVITE_OBJECTS = "SELECT type, name, sql FROM sqlite_master WHERE tbl_name = 'managed_invites' ORDER BY type, name";

describe("schema 12 migration (managed_invites.server_id is NOT NULL)", () => {
  it("rebuilds the table to the same DDL as a fresh database, indexes included", () => {
    createSchema11Database(fx.path);
    fx.open().close();
    const fresh = join(fx.dir, "fresh", "webspeak.db");
    mkdirSyncFor(fresh);
    fx.open(fresh).close();
    expect(rows(fx.path, INVITE_OBJECTS)).toEqual(rows(fresh, INVITE_OBJECTS));
    expect(rows(fx.path, "SELECT name, \"notnull\" FROM pragma_table_info('managed_invites') WHERE name = 'server_id'")).toEqual([
      { name: "server_id", notnull: 1 },
    ]);
  });

  it("carries every invite over unchanged, whatever its state", () => {
    createSchema11Database(fx.path);
    const before = rows(fx.path, "SELECT * FROM managed_invites ORDER BY id");
    fx.open().close();
    expect(rows(fx.path, "SELECT * FROM managed_invites ORDER BY id")).toEqual(before);
    expect(before).toHaveLength(3);
  });

  it("leaves every other table byte-identical", () => {
    createSchema11Database(fx.path);
    const tables = ["metadata", "admin_credentials", "ts_servers", "welcome_texts", "relay_nodes", "settings"];
    const dump = () => [
      ...tables.map((table) => rows(fx.path, `SELECT * FROM ${table}`)),
      rows(fx.path, "SELECT id, event, details_json, created_at FROM audit_events"),
    ];
    const before = dump();
    fx.open().close();
    expect(dump()).toEqual(before);
  });

  it("refuses an invite without a server, and keeps the token unique", () => {
    createSchema11Database(fx.path);
    fx.open().close();
    const check = new DatabaseSync(fx.path);
    try {
      const insert = (id: string, server: string | null, hash: string) =>
        check
          .prepare(
            `INSERT INTO managed_invites (id, server_id, token_hash, target_host, target_port, expires_at, max_uses, created_at)
             VALUES (?, ?, ?, 'h', 1, 'x', 0, 'x')`,
          )
          .run(id, server, hash);
      expect(() => insert("a", null, "hash-a")).toThrow(/NOT NULL/);
      expect(() => insert("b", "server-default", "hash-1")).toThrow(/UNIQUE/);
    } finally {
      check.close();
    }
  });

  it("keeps the invites working through the repositories", () => {
    createSchema11Database(fx.path);
    const database = fx.open();
    expect(database.schemaVersion).toBe(DATABASE_SCHEMA_VERSION);
    expect(database.listManagedInvites().map((entry) => [entry.id, entry.serverId])).toEqual([
      ["invite-3", "server-gone"],
      ["invite-2", "server-b"],
      ["invite-1", "server-default"],
    ]);
    expect(database.consumeManagedInvite("hash-1")).toMatchObject({ id: "invite-1", useCount: 3 });
    expect(database.removeServer("server-b")).toBeTruthy();
  });

  it("writes the schema 11 backup first, and it still allows an empty server_id", () => {
    createSchema11Database(fx.path);
    fx.open().close();
    const backupPath = `${fx.path}.schema-11.bak`;
    expect(existsSync(backupPath)).toBe(true);
    expect(rows(backupPath, "SELECT \"notnull\" FROM pragma_table_info('managed_invites') WHERE name = 'server_id'")).toEqual([
      { notnull: 0 },
    ]);
  });
});

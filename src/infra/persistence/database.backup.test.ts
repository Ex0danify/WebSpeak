import { existsSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { mkdirSyncFor, useDatabaseFixture } from "../../../test/support/database.js";

const fx = useDatabaseFixture();

/** A schema 10 database in WAL mode whose newest row lives only in the `-wal` file; the returned connection must stay open. */
function createSchema10WithPendingWal(file: string): DatabaseSync {
  mkdirSyncFor(file);
  const raw = new DatabaseSync(file);
  raw.exec("PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0;");
  raw.exec(`
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT NOT NULL, details_json TEXT NOT NULL, created_at TEXT NOT NULL);
    PRAGMA user_version = 10;
  `);
  raw.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  raw.exec("INSERT INTO audit_events (event, details_json, created_at) VALUES ('ONLY_IN_WAL', '{}', '2024-01-01T00:00:00.000Z')");
  return raw;
}

describe("schema backup before a migration", () => {
  it("contains rows that are committed but still only in the WAL file", () => {
    const writer = createSchema10WithPendingWal(fx.path);
    try {
      try {
        fx.open();
      } catch {
        /* the toy schema 10 may not migrate; the backup is written before that */
      }
      const backupPath = `${fx.path}.schema-10.bak`;
      expect(existsSync(backupPath)).toBe(true);
      const backup = new DatabaseSync(backupPath, { readOnly: true });
      try {
        expect(backup.prepare("SELECT event FROM audit_events").all()).toEqual([{ event: "ONLY_IN_WAL" }]);
      } finally {
        backup.close();
      }
    } finally {
      writer.close();
    }
  });

  it.skipIf(process.platform === "win32")("is readable by its owner only", () => {
    const writer = createSchema10WithPendingWal(fx.path);
    try {
      try {
        fx.open();
      } catch {
        /* see above */
      }
      expect(statSync(`${fx.path}.schema-10.bak`).mode & 0o777).toBe(0o600);
    } finally {
      writer.close();
    }
  });
});

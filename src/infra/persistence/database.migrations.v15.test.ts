import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { mkdirSyncFor, useDatabaseFixture } from "../../../test/support/database.js";
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

/** A schema 14 file: the current layout without the column schema 15 adds. */
function createSchema14Database(file: string): void {
  fx.open().close();
  const raw = new DatabaseSync(file);
  raw.exec("ALTER TABLE connection_records DROP COLUMN user_agent");
  raw.exec(`INSERT INTO connection_records (id, nickname, client_ip, target, started_at, status) VALUES ('w-old', 'olga', '10.0.0.1', 'ts:9987', '2026-10-01T10:00:00.000Z', 'disconnected')`);
  raw.exec("PRAGMA user_version = 14");
  raw.close();
}

describe("schema 15 migration (the browser of a session)", () => {
  it("ends with the columns of a fresh database and keeps the old rows, without a user agent", () => {
    createSchema14Database(fx.path);
    const database = fx.open();
    const fresh = join(fx.dir, "fresh", "webspeak.db");
    mkdirSyncFor(fresh);
    fx.open(fresh).close();
    expect(rows(fx.path, "PRAGMA table_info(connection_records)")).toEqual(rows(fresh, "PRAGMA table_info(connection_records)"));
    expect(rows(fx.path, "PRAGMA user_version")).toEqual([{ user_version: DATABASE_SCHEMA_VERSION }]);
    expect(database.getConnection("w-old")).toMatchObject({ nickname: "olga", userAgent: null });
  });
});

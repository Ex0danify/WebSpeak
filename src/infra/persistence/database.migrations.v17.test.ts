import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { useDatabaseFixture } from "../../../test/support/database.js";
import { DATABASE_SCHEMA_VERSION } from "./database.js";

const fx = useDatabaseFixture();

/** A schema 16 file: the current layout without the column schema 17 adds. */
function createSchema16Database(file: string): void {
  fx.open().close();
  const raw = new DatabaseSync(file);
  raw.exec("ALTER TABLE settings DROP COLUMN log_retention_days");
  raw.exec("UPDATE settings SET site_name = 'Eleven', connection_retention_days = 12");
  raw.exec("PRAGMA user_version = 16");
  raw.close();
}

describe("schema 17 migration (log file retention)", () => {
  it("gives the existing settings 30 days for the log files and keeps the other retention", () => {
    createSchema16Database(fx.path);
    const database = fx.open();
    expect(database.schemaVersion).toBe(DATABASE_SCHEMA_VERSION);
    expect(database.getSettings()).toMatchObject({
      siteName: "Eleven",
      retention: { connections: { days: 12 }, logs: { days: 30 } },
    });
  });

  it("refuses a value outside the bounds", () => {
    fx.open().close();
    const raw = new DatabaseSync(fx.path);
    try {
      expect(() => raw.exec("UPDATE settings SET log_retention_days = 0")).toThrow();
      expect(() => raw.exec("UPDATE settings SET log_retention_days = 366")).toThrow();
    } finally {
      raw.close();
    }
  });
});

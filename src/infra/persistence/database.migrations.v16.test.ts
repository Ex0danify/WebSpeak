import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { useDatabaseFixture } from "../../../test/support/database.js";
import { DATABASE_SCHEMA_VERSION } from "./database.js";

const fx = useDatabaseFixture();

/** The columns schema 18 adds, dropped first so the older layout is what the migrations start from. */
const LATER_COLUMNS = ["link_preview_image_kib", "link_preview_click_image_kib", "link_preview_svg_kib", "link_preview_cache_kib"];

/** A schema 15 file: the current layout without the columns the later schemas add. */
function createSchema15Database(file: string): void {
  fx.open().close();
  const raw = new DatabaseSync(file);
  for (const column of LATER_COLUMNS) raw.exec(`ALTER TABLE settings DROP COLUMN ${column}`);
  raw.exec("ALTER TABLE settings DROP COLUMN log_retention_days");
  raw.exec("ALTER TABLE settings DROP COLUMN privacy_notice_url");
  raw.exec("UPDATE settings SET site_name = 'Eleven'");
  raw.exec("PRAGMA user_version = 15");
  raw.close();
}

describe("schema 16 migration (the privacy notice address)", () => {
  it("gives the existing settings an empty address, which means none, and keeps the rest", () => {
    createSchema15Database(fx.path);
    const database = fx.open();
    expect(database.schemaVersion).toBe(DATABASE_SCHEMA_VERSION);
    expect(database.getSettings()).toMatchObject({ siteName: "Eleven", privacyNoticeUrl: "" });
  });
});

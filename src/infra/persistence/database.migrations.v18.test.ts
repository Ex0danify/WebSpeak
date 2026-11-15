import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { useDatabaseFixture } from "../../../test/support/database.js";
import { DATABASE_SCHEMA_VERSION } from "./database.js";

const fx = useDatabaseFixture();

const COLUMNS = ["link_preview_image_kib", "link_preview_click_image_kib", "link_preview_svg_kib", "link_preview_cache_kib"];

/** A schema 17 file: the current layout without the columns schema 18 adds. */
function createSchema17Database(file: string): void {
  fx.open().close();
  const raw = new DatabaseSync(file);
  for (const column of COLUMNS) raw.exec(`ALTER TABLE settings DROP COLUMN ${column}`);
  raw.exec("UPDATE settings SET site_name = 'Seventeen', log_retention_days = 12");
  raw.exec("PRAGMA user_version = 17");
  raw.close();
}

describe("schema 18 migration (link preview limits)", () => {
  it("is the current schema", () => {
    expect(DATABASE_SCHEMA_VERSION).toBe(18);
  });

  it("gives the existing settings the default limits and keeps the rest", () => {
    createSchema17Database(fx.path);
    const database = fx.open();
    expect(database.schemaVersion).toBe(DATABASE_SCHEMA_VERSION);
    expect(database.getSettings()).toMatchObject({
      siteName: "Seventeen",
      retention: { logs: { days: 12 } },
      linkPreview: { imageKib: 1024, clickImageKib: 8192, svgKib: 128, cacheKib: 32768 },
    });
  });

  it("gives a new database the same defaults", () => {
    expect(fx.open().getSettings().linkPreview).toEqual({ imageKib: 1024, clickImageKib: 8192, svgKib: 128, cacheKib: 32768 });
  });

  it("refuses a value outside the bounds of each column", () => {
    fx.open().close();
    const raw = new DatabaseSync(fx.path);
    const outside: Array<[string, number[]]> = [
      ["link_preview_image_kib", [63, 4097]],
      ["link_preview_click_image_kib", [1023, 32769]],
      ["link_preview_svg_kib", [15, 1025]],
      ["link_preview_cache_kib", [4095, 262145]],
    ];
    try {
      for (const [column, values] of outside) {
        for (const value of values) expect(() => raw.exec(`UPDATE settings SET ${column} = ${value}`), `${column} ${value}`).toThrow();
      }
    } finally {
      raw.close();
    }
  });

  it("stores what the settings repository writes", () => {
    const database = fx.open();
    const current = database.getSettings();
    database.updateSettings(
      {
        siteName: current.siteName,
        accessMode: current.accessMode,
        webRtcEnabled: current.webRtcEnabled,
        linkPreview: { imageKib: 256, clickImageKib: 2048, svgKib: 32, cacheKib: 8192 },
      },
      { changes: [] },
    );
    expect(database.getSettings().linkPreview).toEqual({ imageKib: 256, clickImageKib: 2048, svgKib: 32, cacheKib: 8192 });
  });
});

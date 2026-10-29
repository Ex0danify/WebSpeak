import { existsSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { findCjkCells } from "../../../test/support/cjkScan.js";
import { mkdirSyncFor, useDatabaseFixture } from "../../../test/support/database.js";
import { DATABASE_SCHEMA_VERSION, WebSpeakDatabase } from "./database.js";

const fx = useDatabaseFixture();

describe("migrations", () => {
  it("creates the schema from an empty file, including missing parent directories", () => {
    const database = fx.open();
    expect(database.schemaVersion).toBe(DATABASE_SCHEMA_VERSION);
    expect(existsSync(fx.path)).toBe(true);
    expect(database.hasAdmin()).toBe(false);
    expect(database.getAdminCredential()).toBeNull();
  });

  it("seeds the default settings row on first use", () => {
    expect(fx.open().getSettings()).toMatchObject({
      siteName: "WebSpeak",
      welcomeTexts: {},
      accessMode: "fixed",
      webRtcEnabled: false,
      webRtcUdpStart: 40000,
      webRtcUdpEnd: 40099,
      identityMintMaxLevel: 8,
      identityMintConcurrency: 2,
      identityMintQueueDepth: 20,
    });
  });

  it("seeds the default server on first use", () => {
    expect(fx.open().listServers()).toMatchObject([
      { id: "server-default", name: "WebSpeak", host: "127.0.0.1", port: 9987, passwordEncrypted: null, lastTestAt: null },
    ]);
  });

  it("does not write a schema backup for a database it just created", () => {
    fx.open();
    expect(readdirSync(fx.dir).filter((name) => name.endsWith(".bak"))).toEqual([]);
  });

  it("keeps data across a reopen and copies a .bak of the current schema on every start of an existing database (current behavior)", () => {
    const first = fx.open();
    first.setMeta("k", "v");
    first.close();
    const second = fx.open();
    expect(second.getMeta("k")).toBe("v");
    expect(existsSync(`${fx.path}.schema-${DATABASE_SCHEMA_VERSION}.bak`)).toBe(true);
  });

  it.each([1, 5, 9])("refuses a schema %i database and leaves the file alone", (version) => {
    mkdirSyncFor(fx.path);
    const raw = new DatabaseSync(fx.path);
    raw.exec(`CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL); PRAGMA user_version = ${version}`);
    raw.close();
    expect(() => new WebSpeakDatabase(fx.path)).toThrow(/older than the oldest this WebSpeak build upgrades \(10\)/);
    expect(readdirSync(fx.dir).filter((name) => name.endsWith(".bak"))).toEqual([]);
    const check = new DatabaseSync(fx.path, { readOnly: true });
    try {
      expect((check.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(version);
    } finally {
      check.close();
    }
  });

  it("holds no CJK character in a new database", () => {
    fx.open().close();
    expect(findCjkCells(fx.path)).toEqual([]);
    expect(fx.open().getSettings().welcomeTexts).toEqual({});
  });

  it("refuses a database written by a newer build", () => {
    mkdirSyncFor(fx.path);
    const raw = new DatabaseSync(fx.path);
    raw.exec(`PRAGMA user_version = ${DATABASE_SCHEMA_VERSION + 1}`);
    raw.close();
    expect(() => new WebSpeakDatabase(fx.path)).toThrow(/newer than this WebSpeak build/);
  });
});

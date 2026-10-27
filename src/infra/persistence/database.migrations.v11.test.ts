import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { mkdirSyncFor, useDatabaseFixture } from "../../../test/support/database.js";
import { createSchema10Database } from "../../../test/support/schema10Database.js";
import { DATABASE_SCHEMA_VERSION } from "./database.js";

const fx = useDatabaseFixture();

function settingsColumns(file: string): string[] {
  const raw = new DatabaseSync(file, { readOnly: true });
  try {
    return (raw.prepare("PRAGMA table_info(settings)").all() as Array<{ name: string }>).map((column) => column.name);
  } finally {
    raw.close();
  }
}

/** Raw rows of the tables the migration must leave alone, in a stable order. */
function dumpUntouchedTables(file: string): Record<string, unknown[]> {
  const raw = new DatabaseSync(file, { readOnly: true });
  try {
    const rows = (sql: string) => raw.prepare(sql).all();
    return {
      metadata: rows("SELECT * FROM metadata WHERE key <> 'legacy_config_checked' ORDER BY key"),
      admin_credentials: rows("SELECT * FROM admin_credentials"),
      audit_events: rows("SELECT id, event, details_json, created_at FROM audit_events ORDER BY id"),
      managed_invites: rows("SELECT * FROM managed_invites ORDER BY id"),
      ts_servers: rows("SELECT * FROM ts_servers ORDER BY id"),
      welcome_texts: rows("SELECT * FROM welcome_texts ORDER BY language"),
      relay_nodes: rows("SELECT * FROM relay_nodes ORDER BY id"),
      settings: rows(
        `SELECT id, site_name, access_mode, updated_at, webrtc_enabled, webrtc_udp_start, webrtc_udp_end, identity_mint_max_level,
         identity_mint_concurrency, identity_mint_queue_depth FROM settings`,
      ),
    };
  } finally {
    raw.close();
  }
}

describe("schema 11 migration (single-relay columns dropped)", () => {
  it("drops the single-relay columns, including the ones with a CHECK, and the WebRTC public host", () => {
    createSchema10Database(fx.path);
    expect(settingsColumns(fx.path)).toContain("relay_port");
    fx.open().close();
    const fresh = join(fx.dir, "fresh", "webspeak.db");
    mkdirSyncFor(fresh);
    fx.open(fresh).close();
    expect(settingsColumns(fx.path).sort()).toEqual(settingsColumns(fresh).sort());
  });

  it("leaves every other table and setting byte-identical", () => {
    createSchema10Database(fx.path);
    const before = dumpUntouchedTables(fx.path);
    fx.open().close();
    expect(dumpUntouchedTables(fx.path)).toEqual(before);
  });

  it("keeps the data usable through the repositories", () => {
    createSchema10Database(fx.path);
    const database = fx.open();
    expect(database.schemaVersion).toBe(DATABASE_SCHEMA_VERSION);
    expect(database.getSettings()).toMatchObject({
      siteName: "Ten",
      webRtcUdpStart: 41000,
      welcomeTexts: { de: "Willkommen", en: "Welcome" },
    });
    expect(database.listRelayNodes()).toMatchObject([{ id: "relay-a", name: "Frankfurt", host: "relay.example.org", port: 39100 }]);
    expect(database.listServers()).toMatchObject([{ id: "server-default", name: "Ten", host: "ten.example.org", port: 9010 }]);
    expect(database.listManagedInvites().map((entry) => [entry.id, entry.serverId])).toEqual([["invite-1", "server-default"]]);
  });

  it("removes the stale legacy config marker and keeps the other metadata", () => {
    createSchema10Database(fx.path);
    const database = fx.open();
    expect(database.getMeta("legacy_config_checked")).toBeNull();
    expect(database.getMeta("visitor_count")).toBe("41");
  });

  it("writes the schema 10 backup first, and it still holds the columns", () => {
    createSchema10Database(fx.path);
    fx.open().close();
    const backupPath = `${fx.path}.schema-10.bak`;
    expect(existsSync(backupPath)).toBe(true);
    expect(settingsColumns(backupPath)).toEqual(expect.arrayContaining(["relay_token_encrypted", "webrtc_public_host"]));
  });

  it("exports a backup from the upgraded database that opens with the same data", () => {
    createSchema10Database(fx.path);
    const exported = fx.open().exportBackup();
    const restoredPath = join(fx.dir, "restored", "webspeak.db");
    mkdirSyncFor(restoredPath);
    writeFileSync(restoredPath, exported);
    const restored = fx.open(restoredPath);
    expect(restored.schemaVersion).toBe(DATABASE_SCHEMA_VERSION);
    expect(restored.getSettings()).toMatchObject({ siteName: "Ten", welcomeTexts: { de: "Willkommen", en: "Welcome" } });
    expect(restored.listManagedInvites()).toHaveLength(1);
    expect(restored.getMeta("visitor_count")).toBe("41");
  });

  it("restoring a schema 10 backup file upgrades it on the next start", () => {
    const backupPath = join(fx.dir, "restore", "webspeak.db");
    createSchema10Database(backupPath);
    const target = join(fx.dir, "restored-v10", "webspeak.db");
    mkdirSyncFor(target);
    writeFileSync(target, readFileSync(backupPath));
    const database = fx.open(target);
    expect(database.schemaVersion).toBe(DATABASE_SCHEMA_VERSION);
    expect(database.getSettings().welcomeTexts).toEqual({ de: "Willkommen", en: "Welcome" });
  });
});

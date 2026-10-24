import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { findCjkCells } from "../../../test/support/cjkScan.js";
import { mkdirSyncFor, useDatabaseFixture } from "../../../test/support/database.js";
import { DATABASE_SCHEMA_VERSION } from "./database.js";

const fx = useDatabaseFixture();

// Chinese, Russian and Japanese text as escapes, so this file holds no CJK character.
const CHINESE_RELAY_NAME = "\u4e2d\u7ee7\u52a0\u901f";
const CHINESE_WELCOME = "\u6b22\u8fce\u6765\u5230 WebSpeak";
const RUSSIAN_WELCOME = "\u0414\u043e\u0431\u0440\u043e \u043f\u043e\u0436\u0430\u043b\u043e\u0432\u0430\u0442\u044c";
const JAPANESE_WELCOME = "\u3088\u3046\u3053\u305d";
const CUSTOM_RELAY_NAME = "Frankfurt";

/** A database exactly as a build at schema 7 left it, filled with rows that exercise every part of the v8 migration. */
function createSchema7Database(file: string): void {
  mkdirSyncFor(file);
  const raw = new DatabaseSync(file);
  raw.exec(`
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE admin_credentials (id INTEGER PRIMARY KEY CHECK (id = 1), credential_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      site_name TEXT NOT NULL,
      welcome_text TEXT NOT NULL,
      access_mode TEXT NOT NULL CHECK (access_mode IN ('fixed', 'open')),
      ts_host TEXT NOT NULL,
      ts_port INTEGER NOT NULL CHECK (ts_port BETWEEN 1 AND 65535),
      ts_password_encrypted TEXT,
      detected_protocol TEXT CHECK (detected_protocol IS NULL OR detected_protocol IN ('ts3', 'ts6')),
      last_test_at TEXT,
      last_test_latency_ms INTEGER,
      last_test_error TEXT,
      updated_at TEXT NOT NULL
    , webrtc_enabled INTEGER NOT NULL DEFAULT 0 CHECK (webrtc_enabled IN (0, 1)), webrtc_public_host TEXT NOT NULL DEFAULT '', webrtc_udp_start INTEGER NOT NULL DEFAULT 40000 CHECK (webrtc_udp_start BETWEEN 1 AND 65535), webrtc_udp_end INTEGER NOT NULL DEFAULT 40099 CHECK (webrtc_udp_end BETWEEN 1 AND 65535), welcome_text_en TEXT NOT NULL DEFAULT '', relay_configured INTEGER NOT NULL DEFAULT 0 CHECK (relay_configured IN (0, 1)), relay_enabled INTEGER NOT NULL DEFAULT 0 CHECK (relay_enabled IN (0, 1)), relay_name TEXT NOT NULL DEFAULT '', relay_host TEXT NOT NULL DEFAULT '', relay_port INTEGER NOT NULL DEFAULT 39087 CHECK (relay_port BETWEEN 1 AND 65535), relay_token_encrypted TEXT, welcome_text_de TEXT NOT NULL DEFAULT '', welcome_text_ru TEXT NOT NULL DEFAULT '', welcome_text_ja TEXT NOT NULL DEFAULT '');
    CREATE TABLE audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT NOT NULL, details_json TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE managed_invites (
      id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, target_host TEXT NOT NULL,
      target_port INTEGER NOT NULL CHECK (target_port BETWEEN 1 AND 65535), server_password_encrypted TEXT,
      channel TEXT NOT NULL DEFAULT '', expires_at TEXT NOT NULL, max_uses INTEGER NOT NULL CHECK (max_uses >= 0),
      use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0), created_at TEXT NOT NULL, revoked_at TEXT
    );
    CREATE INDEX managed_invites_token_idx ON managed_invites(token_hash);
    CREATE INDEX managed_invites_expiry_idx ON managed_invites(expires_at);
    CREATE TABLE relay_nodes (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
      host TEXT NOT NULL, port INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535), token_encrypted TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX relay_nodes_enabled_idx ON relay_nodes(enabled);
  `);
  raw
    .prepare(
      `INSERT INTO settings (id, site_name, welcome_text, access_mode, ts_host, ts_port, ts_password_encrypted, detected_protocol,
       last_test_at, last_test_latency_ms, last_test_error, updated_at, webrtc_enabled, webrtc_public_host, webrtc_udp_start, webrtc_udp_end,
       welcome_text_en, relay_configured, relay_enabled, relay_name, relay_host, relay_port, relay_token_encrypted,
       welcome_text_de, welcome_text_ru, welcome_text_ja)
     VALUES (1, 'Seven', ?, 'open', 'seven.example.org', 9007, 'enc:ts-password', 'ts6', '2024-03-03T00:00:00.000Z', 12, NULL,
       '2024-03-04T00:00:00.000Z', 1, 'pub.example.org', 41000, 41010, 'Welcome', 1, 1, ?, 'relay.example.org', 39100, 'enc:relay-token',
       'Willkommen', ?, ?)`,
    )
    .run(CHINESE_WELCOME, CHINESE_RELAY_NAME, RUSSIAN_WELCOME, JAPANESE_WELCOME);
  const node = raw.prepare(
    "INSERT INTO relay_nodes (id, name, enabled, host, port, token_encrypted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  node.run(
    "relay-default",
    CHINESE_RELAY_NAME,
    1,
    "relay.example.org",
    39100,
    "enc:relay-token",
    "2024-01-01T00:00:00.000Z",
    "2024-01-02T00:00:00.000Z",
  );
  node.run("relay-b", CUSTOM_RELAY_NAME, 0, "b.example.org", 39101, "enc:b", "2024-01-03T00:00:00.000Z", "2024-01-03T00:00:00.000Z");
  raw.prepare("INSERT INTO metadata (key, value) VALUES ('visitor_count', '41'), ('legacy_config_checked', '1')").run();
  raw
    .prepare(
      "INSERT INTO admin_credentials (id, credential_json, created_at, updated_at) VALUES (1, ?, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z')",
    )
    .run('{"version":1,"username":"root","salt":"c2FsdA","hash":"aGFzaA"}');
  raw
    .prepare(
      "INSERT INTO audit_events (event, details_json, created_at) VALUES ('ADMIN_INITIALIZED', '{\"accessMode\":\"open\"}', '2024-01-01T00:00:00.000Z'), ('SETTINGS_CHANGED', '{}', '2024-01-02T00:00:00.000Z')",
    )
    .run();
  raw
    .prepare(
      "INSERT INTO managed_invites (id, token_hash, target_host, target_port, server_password_encrypted, channel, expires_at, max_uses, use_count, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      "invite-1",
      "hash-1",
      "ts.example.org",
      9987,
      "enc:invite-password",
      "Lobby",
      "2030-01-01T00:00:00.000Z",
      5,
      2,
      "2024-01-01T00:00:00.000Z",
      null,
    );
  raw.exec("PRAGMA user_version = 7");
  raw.close();
}

/** Raw rows of the tables the migration must leave alone, in a stable order. */
function dumpUntouchedTables(file: string): Record<string, unknown[]> {
  const raw = new DatabaseSync(file, { readOnly: true });
  try {
    const rows = (sql: string) => raw.prepare(sql).all();
    return {
      metadata: rows("SELECT * FROM metadata ORDER BY key"),
      admin_credentials: rows("SELECT * FROM admin_credentials"),
      audit_events: rows("SELECT * FROM audit_events ORDER BY id"),
      managed_invites: rows(
        `SELECT id, token_hash, target_host, target_port, server_password_encrypted, channel, expires_at, max_uses, use_count, created_at, revoked_at
         FROM managed_invites ORDER BY id`,
      ),
      settings:
        rows(`SELECT id, site_name, access_mode, updated_at, webrtc_enabled, webrtc_public_host, webrtc_udp_start, webrtc_udp_end, relay_configured, relay_enabled,
        relay_host, relay_port, relay_token_encrypted FROM settings`),
      relay_nodes: rows("SELECT id, enabled, host, port, token_encrypted, created_at, updated_at FROM relay_nodes ORDER BY id"),
    };
  } finally {
    raw.close();
  }
}

function tableNames(file: string): string[] {
  const raw = new DatabaseSync(file, { readOnly: true });
  try {
    return (
      raw
        .prepare("SELECT type || ':' || name AS entry FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name")
        .all() as Array<{ entry: string }>
    ).map((row) => row.entry);
  } finally {
    raw.close();
  }
}

describe("schema 8 migration (welcome texts as rows, no Chinese in the database)", () => {
  it("the fixture really holds Chinese text, so the checks below can fail", () => {
    createSchema7Database(fx.path);
    expect(
      findCjkCells(fx.path)
        .map((cell) => `${cell.table}.${cell.column}`)
        .sort(),
    ).toEqual(["relay_nodes.name", "settings.relay_name", "settings.welcome_text", "settings.welcome_text_ja"]);
  });

  it("moves the English and German texts into welcome_texts and drops the per-language columns", () => {
    createSchema7Database(fx.path);
    const database = fx.open();
    expect(database.schemaVersion).toBe(DATABASE_SCHEMA_VERSION);
    expect(database.getSettings().welcomeTexts).toEqual({ de: "Willkommen", en: "Welcome" });
    database.close();
    const raw = new DatabaseSync(fx.path, { readOnly: true });
    try {
      const columns = (raw.prepare("PRAGMA table_info(settings)").all() as Array<{ name: string }>).map((column) => column.name);
      expect(columns.filter((name) => name.startsWith("welcome_text"))).toEqual([]);
    } finally {
      raw.close();
    }
  });

  it("does not carry the Chinese, Russian or Japanese texts over, and leaves no CJK character in any text cell", () => {
    createSchema7Database(fx.path);
    const database = fx.open();
    expect(Object.keys(database.getSettings().welcomeTexts)).toEqual(["de", "en"]);
    database.close();
    expect(findCjkCells(fx.path)).toEqual([]);
  });

  it("rewrites the old Chinese default relay name and keeps a name the administrator chose", () => {
    createSchema7Database(fx.path);
    const database = fx.open();
    expect(database.listRelayNodes().map((node) => [node.id, node.name])).toEqual([
      ["relay-default", "Relay acceleration"],
      ["relay-b", CUSTOM_RELAY_NAME],
    ]);
  });

  it("leaves invites, audit, credentials, metadata, secrets and every other setting byte-identical", () => {
    createSchema7Database(fx.path);
    const before = dumpUntouchedTables(fx.path);
    fx.open().close();
    expect(dumpUntouchedTables(fx.path)).toEqual(before);
  });

  it("moves the single TeamSpeak target into the first server and ties the invites to it", () => {
    createSchema7Database(fx.path);
    const database = fx.open();
    expect(database.listServers()).toEqual([
      {
        id: "server-default",
        name: "Seven",
        host: "seven.example.org",
        port: 9007,
        passwordEncrypted: "enc:ts-password",
        lastTestAt: "2024-03-03T00:00:00.000Z",
        lastTestLatencyMs: 12,
        lastTestError: null,
        createdAt: "2024-03-04T00:00:00.000Z",
        updatedAt: "2024-03-04T00:00:00.000Z",
      },
    ]);
    expect(database.listManagedInvites().map((entry) => [entry.id, entry.serverId])).toEqual([["invite-1", "server-default"]]);
  });

  it("writes the schema 7 backup first, and it still holds the old data", () => {
    createSchema7Database(fx.path);
    fx.open().close();
    const backupPath = `${fx.path}.schema-7.bak`;
    expect(existsSync(backupPath)).toBe(true);
    const backup = new DatabaseSync(backupPath, { readOnly: true });
    try {
      expect((backup.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(7);
      const row = backup.prepare("SELECT welcome_text, welcome_text_ru, welcome_text_ja FROM settings WHERE id = 1").get() as Record<
        string,
        string
      >;
      expect(row).toEqual({ welcome_text: CHINESE_WELCOME, welcome_text_ru: RUSSIAN_WELCOME, welcome_text_ja: JAPANESE_WELCOME });
    } finally {
      backup.close();
    }
  });

  it("a v7 database ends with the same objects as a fresh one", () => {
    fx.open().close();
    const fresh = tableNames(fx.path);
    const upgradedPath = join(fx.dir, "v7", "webspeak.db");
    createSchema7Database(upgradedPath);
    fx.open(upgradedPath).close();
    expect(tableNames(upgradedPath)).toEqual(fresh);
    expect(fresh).toContain("table:welcome_texts");
  });

  it("exports a backup from the upgraded database that opens as schema 8 with the same data", () => {
    createSchema7Database(fx.path);
    const exported = fx.open().exportBackup();
    const restoredPath = join(fx.dir, "restored", "webspeak.db");
    mkdirSyncFor(restoredPath);
    writeFileSync(restoredPath, exported);
    const restored = fx.open(restoredPath);
    expect(restored.schemaVersion).toBe(DATABASE_SCHEMA_VERSION);
    expect(restored.getSettings()).toMatchObject({
      siteName: "Seven",
      welcomeTexts: { de: "Willkommen", en: "Welcome" },
    });
    expect(restored.listManagedInvites()).toHaveLength(1);
    expect(restored.getMeta("visitor_count")).toBe("41");
  });

  it("restoring an old schema 7 backup file upgrades it on the next start", () => {
    const backupPath = join(fx.dir, "restore", "webspeak.db");
    createSchema7Database(backupPath);
    const bytes = readFileSync(backupPath);
    const target = join(fx.dir, "restored-v7", "webspeak.db");
    mkdirSyncFor(target);
    writeFileSync(target, bytes);
    const database = fx.open(target);
    expect(database.schemaVersion).toBe(DATABASE_SCHEMA_VERSION);
    expect(database.getSettings().welcomeTexts).toEqual({ de: "Willkommen", en: "Welcome" });
  });

  it("a new database holds no welcome text and no CJK character", () => {
    fx.open().close();
    expect(findCjkCells(fx.path)).toEqual([]);
    expect(fx.open().getSettings().welcomeTexts).toEqual({});
  });
});

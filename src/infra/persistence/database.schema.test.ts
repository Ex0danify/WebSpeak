import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { mkdirSyncFor, useDatabaseFixture } from "../../../test/helpers/database.js";

const fx = useDatabaseFixture();

/** Every schema object as SQLite stores it, so a moved migration cannot change a single byte of DDL. */
function dumpSchema(file: string): Array<{ type: string; name: string; sql: string | null }> {
  const raw = new DatabaseSync(file);
  try {
    return raw.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all() as Array<{
      type: string;
      name: string;
      sql: string | null;
    }>;
  } finally {
    raw.close();
  }
}

/** A database exactly as a build at schema 6 left it (relay_nodes exists, no per-language welcome columns yet). */
function createSchema6Database(file: string): void {
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
    );
    CREATE TABLE audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT NOT NULL, details_json TEXT NOT NULL, created_at TEXT NOT NULL);
    INSERT INTO settings (id, site_name, welcome_text, access_mode, ts_host, ts_port, updated_at)
      VALUES (1, 'Six', 'hello six', 'open', 'six.example.org', 9001, '2024-02-02T00:00:00.000Z');
    CREATE TABLE managed_invites (
      id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, target_host TEXT NOT NULL,
      target_port INTEGER NOT NULL CHECK (target_port BETWEEN 1 AND 65535), server_password_encrypted TEXT,
      channel TEXT NOT NULL DEFAULT '', expires_at TEXT NOT NULL, max_uses INTEGER NOT NULL CHECK (max_uses >= 0),
      use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0), created_at TEXT NOT NULL, revoked_at TEXT
    );
    CREATE INDEX managed_invites_token_idx ON managed_invites(token_hash);
    CREATE INDEX managed_invites_expiry_idx ON managed_invites(expires_at);
    ALTER TABLE settings ADD COLUMN webrtc_enabled INTEGER NOT NULL DEFAULT 0 CHECK (webrtc_enabled IN (0, 1));
    ALTER TABLE settings ADD COLUMN webrtc_public_host TEXT NOT NULL DEFAULT '';
    ALTER TABLE settings ADD COLUMN webrtc_udp_start INTEGER NOT NULL DEFAULT 40000 CHECK (webrtc_udp_start BETWEEN 1 AND 65535);
    ALTER TABLE settings ADD COLUMN webrtc_udp_end INTEGER NOT NULL DEFAULT 40099 CHECK (webrtc_udp_end BETWEEN 1 AND 65535);
    ALTER TABLE settings ADD COLUMN welcome_text_en TEXT NOT NULL DEFAULT '';
    ALTER TABLE settings ADD COLUMN relay_configured INTEGER NOT NULL DEFAULT 0 CHECK (relay_configured IN (0, 1));
    ALTER TABLE settings ADD COLUMN relay_enabled INTEGER NOT NULL DEFAULT 0 CHECK (relay_enabled IN (0, 1));
    ALTER TABLE settings ADD COLUMN relay_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE settings ADD COLUMN relay_host TEXT NOT NULL DEFAULT '';
    ALTER TABLE settings ADD COLUMN relay_port INTEGER NOT NULL DEFAULT 39087 CHECK (relay_port BETWEEN 1 AND 65535);
    ALTER TABLE settings ADD COLUMN relay_token_encrypted TEXT;
    CREATE TABLE relay_nodes (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
      host TEXT NOT NULL, port INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535), token_encrypted TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX relay_nodes_enabled_idx ON relay_nodes(enabled);
    PRAGMA user_version = 6;
  `);
  raw.close();
}

describe("schema snapshot", () => {
  it("a fresh database ends at the pinned schema", () => {
    fx.open().close();
    expect(dumpSchema(fx.path)).toMatchInlineSnapshot(`
      [
        {
          "name": "managed_invites_expiry_idx",
          "sql": "CREATE INDEX managed_invites_expiry_idx ON managed_invites(expires_at)",
          "type": "index",
        },
        {
          "name": "managed_invites_token_idx",
          "sql": "CREATE INDEX managed_invites_token_idx ON managed_invites(token_hash)",
          "type": "index",
        },
        {
          "name": "relay_nodes_enabled_idx",
          "sql": "CREATE INDEX relay_nodes_enabled_idx ON relay_nodes(enabled)",
          "type": "index",
        },
        {
          "name": "admin_credentials",
          "sql": "CREATE TABLE admin_credentials (
                  id INTEGER PRIMARY KEY CHECK (id = 1),
                  credential_json TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                )",
          "type": "table",
        },
        {
          "name": "audit_events",
          "sql": "CREATE TABLE audit_events (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  event TEXT NOT NULL,
                  details_json TEXT NOT NULL,
                  created_at TEXT NOT NULL
                )",
          "type": "table",
        },
        {
          "name": "managed_invites",
          "sql": "CREATE TABLE managed_invites (
                  id TEXT PRIMARY KEY,
                  token_hash TEXT NOT NULL UNIQUE,
                  target_host TEXT NOT NULL,
                  target_port INTEGER NOT NULL CHECK (target_port BETWEEN 1 AND 65535),
                  server_password_encrypted TEXT,
                  channel TEXT NOT NULL DEFAULT '',
                  expires_at TEXT NOT NULL,
                  max_uses INTEGER NOT NULL CHECK (max_uses >= 0),
                  use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0),
                  created_at TEXT NOT NULL,
                  revoked_at TEXT
                )",
          "type": "table",
        },
        {
          "name": "metadata",
          "sql": "CREATE TABLE metadata (
                  key TEXT PRIMARY KEY,
                  value TEXT NOT NULL
                )",
          "type": "table",
        },
        {
          "name": "relay_nodes",
          "sql": "CREATE TABLE relay_nodes (
                  id TEXT PRIMARY KEY,
                  name TEXT NOT NULL,
                  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
                  host TEXT NOT NULL,
                  port INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
                  token_encrypted TEXT,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                )",
          "type": "table",
        },
        {
          "name": "settings",
          "sql": "CREATE TABLE settings (
                  id INTEGER PRIMARY KEY CHECK (id = 1),
                  site_name TEXT NOT NULL,
                  access_mode TEXT NOT NULL CHECK (access_mode IN ('fixed', 'open')),
                  ts_host TEXT NOT NULL,
                  ts_port INTEGER NOT NULL CHECK (ts_port BETWEEN 1 AND 65535),
                  ts_password_encrypted TEXT,
                  detected_protocol TEXT CHECK (detected_protocol IS NULL OR detected_protocol IN ('ts3', 'ts6')),
                  last_test_at TEXT,
                  last_test_latency_ms INTEGER,
                  last_test_error TEXT,
                  updated_at TEXT NOT NULL
                , webrtc_enabled INTEGER NOT NULL DEFAULT 0 CHECK (webrtc_enabled IN (0, 1)), webrtc_public_host TEXT NOT NULL DEFAULT '', webrtc_udp_start INTEGER NOT NULL DEFAULT 40000 CHECK (webrtc_udp_start BETWEEN 1 AND 65535), webrtc_udp_end INTEGER NOT NULL DEFAULT 40099 CHECK (webrtc_udp_end BETWEEN 1 AND 65535), relay_configured INTEGER NOT NULL DEFAULT 0 CHECK (relay_configured IN (0, 1)), relay_enabled INTEGER NOT NULL DEFAULT 0 CHECK (relay_enabled IN (0, 1)), relay_name TEXT NOT NULL DEFAULT '', relay_host TEXT NOT NULL DEFAULT '', relay_port INTEGER NOT NULL DEFAULT 39087 CHECK (relay_port BETWEEN 1 AND 65535), relay_token_encrypted TEXT)",
          "type": "table",
        },
        {
          "name": "welcome_texts",
          "sql": "CREATE TABLE welcome_texts (
                  language TEXT PRIMARY KEY,
                  text TEXT NOT NULL
                )",
          "type": "table",
        },
      ]
    `);
  });

  it("a schema 6 database upgrades to the same schema as a fresh one and keeps its row", () => {
    fx.open().close();
    const fresh = dumpSchema(fx.path);
    const v6Path = join(fx.dir, "v6", "webspeak.db");
    mkdirSyncFor(v6Path);
    createSchema6Database(v6Path);
    const database = fx.open(v6Path);
    expect(database.getSettings()).toMatchObject({ siteName: "Six", welcomeTexts: {} });
    database.close();
    const upgraded = dumpSchema(v6Path);
    // ALTER TABLE ADD COLUMN stores the added column text, so only the object names must match the fresh layout.
    expect(upgraded.map((entry) => `${entry.type}:${entry.name}`)).toEqual(fresh.map((entry) => `${entry.type}:${entry.name}`));
    expect(upgraded).toMatchInlineSnapshot(`
      [
        {
          "name": "managed_invites_expiry_idx",
          "sql": "CREATE INDEX managed_invites_expiry_idx ON managed_invites(expires_at)",
          "type": "index",
        },
        {
          "name": "managed_invites_token_idx",
          "sql": "CREATE INDEX managed_invites_token_idx ON managed_invites(token_hash)",
          "type": "index",
        },
        {
          "name": "relay_nodes_enabled_idx",
          "sql": "CREATE INDEX relay_nodes_enabled_idx ON relay_nodes(enabled)",
          "type": "index",
        },
        {
          "name": "admin_credentials",
          "sql": "CREATE TABLE admin_credentials (id INTEGER PRIMARY KEY CHECK (id = 1), credential_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
          "type": "table",
        },
        {
          "name": "audit_events",
          "sql": "CREATE TABLE audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT NOT NULL, details_json TEXT NOT NULL, created_at TEXT NOT NULL)",
          "type": "table",
        },
        {
          "name": "managed_invites",
          "sql": "CREATE TABLE managed_invites (
            id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, target_host TEXT NOT NULL,
            target_port INTEGER NOT NULL CHECK (target_port BETWEEN 1 AND 65535), server_password_encrypted TEXT,
            channel TEXT NOT NULL DEFAULT '', expires_at TEXT NOT NULL, max_uses INTEGER NOT NULL CHECK (max_uses >= 0),
            use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0), created_at TEXT NOT NULL, revoked_at TEXT
          )",
          "type": "table",
        },
        {
          "name": "metadata",
          "sql": "CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
          "type": "table",
        },
        {
          "name": "relay_nodes",
          "sql": "CREATE TABLE relay_nodes (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
            host TEXT NOT NULL, port INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535), token_encrypted TEXT,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL
          )",
          "type": "table",
        },
        {
          "name": "settings",
          "sql": "CREATE TABLE settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            site_name TEXT NOT NULL,
            access_mode TEXT NOT NULL CHECK (access_mode IN ('fixed', 'open')),
            ts_host TEXT NOT NULL,
            ts_port INTEGER NOT NULL CHECK (ts_port BETWEEN 1 AND 65535),
            ts_password_encrypted TEXT,
            detected_protocol TEXT CHECK (detected_protocol IS NULL OR detected_protocol IN ('ts3', 'ts6')),
            last_test_at TEXT,
            last_test_latency_ms INTEGER,
            last_test_error TEXT,
            updated_at TEXT NOT NULL
          , webrtc_enabled INTEGER NOT NULL DEFAULT 0 CHECK (webrtc_enabled IN (0, 1)), webrtc_public_host TEXT NOT NULL DEFAULT '', webrtc_udp_start INTEGER NOT NULL DEFAULT 40000 CHECK (webrtc_udp_start BETWEEN 1 AND 65535), webrtc_udp_end INTEGER NOT NULL DEFAULT 40099 CHECK (webrtc_udp_end BETWEEN 1 AND 65535), relay_configured INTEGER NOT NULL DEFAULT 0 CHECK (relay_configured IN (0, 1)), relay_enabled INTEGER NOT NULL DEFAULT 0 CHECK (relay_enabled IN (0, 1)), relay_name TEXT NOT NULL DEFAULT '', relay_host TEXT NOT NULL DEFAULT '', relay_port INTEGER NOT NULL DEFAULT 39087 CHECK (relay_port BETWEEN 1 AND 65535), relay_token_encrypted TEXT)",
          "type": "table",
        },
        {
          "name": "welcome_texts",
          "sql": "CREATE TABLE welcome_texts (
                  language TEXT PRIMARY KEY,
                  text TEXT NOT NULL
                )",
          "type": "table",
        },
      ]
    `);
  });
});

import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { useDatabaseFixture } from "../../../test/support/database.js";
import { createSchema10Database } from "../../../test/support/schema10Database.js";

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
                  server_id TEXT NOT NULL,
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
                  webrtc_enabled INTEGER NOT NULL DEFAULT 0 CHECK (webrtc_enabled IN (0, 1)),
                  webrtc_udp_start INTEGER NOT NULL DEFAULT 40000 CHECK (webrtc_udp_start BETWEEN 1 AND 65535),
                  webrtc_udp_end INTEGER NOT NULL DEFAULT 40099 CHECK (webrtc_udp_end BETWEEN 1 AND 65535),
                  identity_mint_max_level INTEGER NOT NULL DEFAULT 8 CHECK (identity_mint_max_level BETWEEN 1 AND 24),
                  identity_mint_concurrency INTEGER NOT NULL DEFAULT 2 CHECK (identity_mint_concurrency BETWEEN 1 AND 8),
                  identity_mint_queue_depth INTEGER NOT NULL DEFAULT 20 CHECK (identity_mint_queue_depth BETWEEN 0 AND 100),
                  updated_at TEXT NOT NULL
                )",
          "type": "table",
        },
        {
          "name": "ts_servers",
          "sql": "CREATE TABLE ts_servers (
                  id TEXT PRIMARY KEY,
                  name TEXT NOT NULL,
                  host TEXT NOT NULL,
                  port INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
                  password_encrypted TEXT,
                  position INTEGER NOT NULL,
                  last_test_at TEXT,
                  last_test_latency_ms INTEGER,
                  last_test_error TEXT,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                )",
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

  it("a schema 10 database upgrades to the same objects as a fresh one and keeps its row", () => {
    fx.open().close();
    const fresh = dumpSchema(fx.path);
    const v10Path = join(fx.dir, "v10", "webspeak.db");
    createSchema10Database(v10Path);
    const database = fx.open(v10Path);
    expect(database.getSettings()).toMatchObject({ siteName: "Ten" });
    database.close();
    const upgraded = dumpSchema(v10Path);
    // ALTER TABLE keeps the text of the table it changed, so only the object names must match the fresh layout.
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
                  server_id TEXT NOT NULL,
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
                  updated_at TEXT NOT NULL
                , webrtc_enabled INTEGER NOT NULL DEFAULT 0 CHECK (webrtc_enabled IN (0, 1)), webrtc_udp_start INTEGER NOT NULL DEFAULT 40000 CHECK (webrtc_udp_start BETWEEN 1 AND 65535), webrtc_udp_end INTEGER NOT NULL DEFAULT 40099 CHECK (webrtc_udp_end BETWEEN 1 AND 65535), identity_mint_max_level INTEGER NOT NULL DEFAULT 8 CHECK (identity_mint_max_level BETWEEN 1 AND 24), identity_mint_concurrency INTEGER NOT NULL DEFAULT 2 CHECK (identity_mint_concurrency BETWEEN 1 AND 8), identity_mint_queue_depth INTEGER NOT NULL DEFAULT 20 CHECK (identity_mint_queue_depth BETWEEN 0 AND 100))",
          "type": "table",
        },
        {
          "name": "ts_servers",
          "sql": "CREATE TABLE ts_servers (
                  id TEXT PRIMARY KEY,
                  name TEXT NOT NULL,
                  host TEXT NOT NULL,
                  port INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
                  password_encrypted TEXT,
                  position INTEGER NOT NULL,
                  last_test_at TEXT,
                  last_test_latency_ms INTEGER,
                  last_test_error TEXT,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                )",
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

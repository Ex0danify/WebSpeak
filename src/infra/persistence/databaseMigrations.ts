import type { DatabaseSync } from "node:sqlite";

export const DATABASE_SCHEMA_VERSION = 11;

/** The oldest schema this build upgrades, 0.7.0 is the first release that writes it. */
export const MINIMUM_SCHEMA_VERSION = 10;

interface Migration {
  /** Schema version this step upgrades from. */
  from: number;
  /** The version it leaves the database at. */
  to: number;
  up(database: DatabaseSync): void;
}

// Ordered and append-only. SQL in the templates keeps its indentation because SQLite stores
// CREATE statements verbatim.
const MIGRATIONS: Migration[] = [
  {
    // A new file gets the current layout in one step, the steps before schema 10 are gone.
    from: 0,
    to: DATABASE_SCHEMA_VERSION,
    up(database) {
      database.exec(`
          CREATE TABLE metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          );
          CREATE TABLE admin_credentials (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            credential_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE TABLE settings (
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
          );
          CREATE TABLE welcome_texts (
            language TEXT PRIMARY KEY,
            text TEXT NOT NULL
          );
          CREATE TABLE ts_servers (
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
          );
          CREATE TABLE audit_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event TEXT NOT NULL,
            details_json TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
          CREATE TABLE managed_invites (
            id TEXT PRIMARY KEY,
            server_id TEXT,
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
          );
          CREATE INDEX managed_invites_token_idx ON managed_invites(token_hash);
          CREATE INDEX managed_invites_expiry_idx ON managed_invites(expires_at);
          CREATE TABLE relay_nodes (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
            host TEXT NOT NULL,
            port INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
            token_encrypted TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE INDEX relay_nodes_enabled_idx ON relay_nodes(enabled);
        `);
      const now = new Date().toISOString();
      database.prepare("INSERT INTO settings (id, site_name, access_mode, updated_at) VALUES (1, 'WebSpeak', 'fixed', ?)").run(now);
      database
        .prepare(
          `INSERT INTO ts_servers (id, name, host, port, password_encrypted, position, created_at, updated_at)
           VALUES ('server-default', 'WebSpeak', '127.0.0.1', 9987, NULL, 0, ?, ?)`,
        )
        .run(now, now);
    },
  },
  {
    from: 10,
    to: 11,
    up(database) {
      // The relay nodes table is the only source of the relay settings. The single-relay columns were a copy of the
      // first node and are no longer read, nor is the unused WebRTC public host. A leftover marker of the removed
      // legacy config import goes with them.
      database.exec(`
          ALTER TABLE settings DROP COLUMN relay_configured;
          ALTER TABLE settings DROP COLUMN relay_enabled;
          ALTER TABLE settings DROP COLUMN relay_name;
          ALTER TABLE settings DROP COLUMN relay_host;
          ALTER TABLE settings DROP COLUMN relay_port;
          ALTER TABLE settings DROP COLUMN relay_token_encrypted;
          ALTER TABLE settings DROP COLUMN webrtc_public_host;
          DELETE FROM metadata WHERE key = 'legacy_config_checked';
        `);
    },
  },
];

/** Applies every migration newer than version, each in its own transaction. */
export function runMigrations(database: DatabaseSync, version: number, transaction: (action: () => void) => void): void {
  for (const migration of MIGRATIONS) {
    if (migration.from !== version) continue;
    transaction(() => {
      migration.up(database);
      database.exec(`PRAGMA user_version = ${migration.to}`);
    });
    version = migration.to;
  }
}

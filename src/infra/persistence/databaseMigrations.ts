import type { DatabaseSync } from "node:sqlite";

export const DATABASE_SCHEMA_VERSION = 17;

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
            event_log_retention_days INTEGER NOT NULL DEFAULT 90 CHECK (event_log_retention_days BETWEEN 1 AND 365),
            event_log_max_rows INTEGER NOT NULL DEFAULT 5000 CHECK (event_log_max_rows BETWEEN 100 AND 50000),
            connection_retention_days INTEGER NOT NULL DEFAULT 30 CHECK (connection_retention_days BETWEEN 1 AND 365),
            connection_max_rows INTEGER NOT NULL DEFAULT 10000 CHECK (connection_max_rows BETWEEN 100 AND 100000),
            privacy_notice_url TEXT NOT NULL DEFAULT '',
            log_retention_days INTEGER NOT NULL DEFAULT 30 CHECK (log_retention_days BETWEEN 1 AND 365),
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
            category TEXT NOT NULL DEFAULT 'system' CHECK (category IN ('auth', 'config', 'invites', 'availability', 'sessions', 'system')),
            severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error')),
            details_json TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
          CREATE TABLE managed_invites (
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
          CREATE TABLE connection_records (
            id TEXT PRIMARY KEY,
            nickname TEXT NOT NULL,
            client_ip TEXT NOT NULL,
            target TEXT NOT NULL,
            relay_name TEXT,
            relay_target TEXT,
            started_at TEXT NOT NULL,
            connected_at TEXT,
            disconnected_at TEXT,
            duration_seconds INTEGER,
            status TEXT NOT NULL CHECK (status IN ('connecting', 'active', 'disconnected', 'failed')),
            reason TEXT,
            failure_detail TEXT,
            audio_json TEXT,
            user_agent TEXT
          );
          CREATE INDEX connection_records_started_idx ON connection_records(started_at);
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
  {
    from: 11,
    to: 12,
    up(database) {
      // Every invite names its server, the schema 10 upgrade filled the column and nothing writes it empty. SQLite cannot add
      // NOT NULL to a column, so the table is rebuilt. The old one is renamed away first so the new CREATE keeps its text.
      database.exec(`
          ALTER TABLE managed_invites RENAME TO managed_invites_old;
          CREATE TABLE managed_invites (
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
          );
          INSERT INTO managed_invites (
            id, server_id, token_hash, target_host, target_port, server_password_encrypted,
            channel, expires_at, max_uses, use_count, created_at, revoked_at
          ) SELECT
            id, server_id, token_hash, target_host, target_port, server_password_encrypted,
            channel, expires_at, max_uses, use_count, created_at, revoked_at
          FROM managed_invites_old;
          DROP TABLE managed_invites_old;
          CREATE INDEX managed_invites_token_idx ON managed_invites(token_hash);
          CREATE INDEX managed_invites_expiry_idx ON managed_invites(expires_at);
        `);
    },
  },
  {
    from: 12,
    to: 13,
    up(database) {
      // The event log filters by category and severity, so both are stored with the row instead of read from the event name.
      // The old rows are sorted by name once here. Connection tests are no longer logged, only a change of availability is.
      database.exec(`
          ALTER TABLE audit_events RENAME TO audit_events_old;
          CREATE TABLE audit_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'system' CHECK (category IN ('auth', 'config', 'invites', 'availability', 'system')),
            severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error')),
            details_json TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
          INSERT INTO audit_events (id, event, category, severity, details_json, created_at)
          SELECT
            id,
            event,
            CASE
              WHEN event IN ('ADMIN_LOGIN_FAILED', 'ADMIN_LOGIN_SUCCEEDED', 'ADMIN_LOGOUT', 'ADMIN_PASSWORD_CHANGED',
                             'ADMIN_PASSWORD_RESET', 'ADMIN_SESSION_TERMINATED') THEN 'auth'
              WHEN event IN ('SETTINGS_CHANGED', 'SERVER_ADDED', 'SERVER_UPDATED', 'SERVER_REMOVED', 'SERVERS_REORDERED') THEN 'config'
              WHEN substr(event, 1, 7) = 'INVITE_' THEN 'invites'
              ELSE 'system'
            END,
            CASE WHEN event IN ('ADMIN_LOGIN_FAILED', 'ADMIN_PASSWORD_RESET') THEN 'warning' ELSE 'info' END,
            details_json,
            created_at
          FROM audit_events_old
          WHERE event NOT IN ('CONNECTION_TEST_SUCCEEDED', 'CONNECTION_TEST_FAILED');
          DROP TABLE audit_events_old;
        `);
    },
  },
  {
    from: 13,
    to: 14,
    up(database) {
      // Sessions get their own category and a table of their own, one row per session. Retention for both is a setting.
      // The event log table is rebuilt because SQLite cannot change a CHECK, the ids and rows stay as they are.
      database.exec(`
          ALTER TABLE audit_events RENAME TO audit_events_old;
          CREATE TABLE audit_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'system' CHECK (category IN ('auth', 'config', 'invites', 'availability', 'sessions', 'system')),
            severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error')),
            details_json TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
          INSERT INTO audit_events (id, event, category, severity, details_json, created_at)
          SELECT id, event, category, severity, details_json, created_at FROM audit_events_old;
          DROP TABLE audit_events_old;
          ALTER TABLE settings ADD COLUMN event_log_retention_days INTEGER NOT NULL DEFAULT 90 CHECK (event_log_retention_days BETWEEN 1 AND 365);
          ALTER TABLE settings ADD COLUMN event_log_max_rows INTEGER NOT NULL DEFAULT 5000 CHECK (event_log_max_rows BETWEEN 100 AND 50000);
          ALTER TABLE settings ADD COLUMN connection_retention_days INTEGER NOT NULL DEFAULT 30 CHECK (connection_retention_days BETWEEN 1 AND 365);
          ALTER TABLE settings ADD COLUMN connection_max_rows INTEGER NOT NULL DEFAULT 10000 CHECK (connection_max_rows BETWEEN 100 AND 100000);
          CREATE TABLE connection_records (
            id TEXT PRIMARY KEY,
            nickname TEXT NOT NULL,
            client_ip TEXT NOT NULL,
            target TEXT NOT NULL,
            relay_name TEXT,
            relay_target TEXT,
            started_at TEXT NOT NULL,
            connected_at TEXT,
            disconnected_at TEXT,
            duration_seconds INTEGER,
            status TEXT NOT NULL CHECK (status IN ('connecting', 'active', 'disconnected', 'failed')),
            reason TEXT,
            failure_detail TEXT,
            audio_json TEXT
          );
          CREATE INDEX connection_records_started_idx ON connection_records(started_at);
        `);
    },
  },
  {
    from: 14,
    to: 15,
    up(database) {
      // The browser a guest joined with, as the voice socket reported it.
      database.exec("ALTER TABLE connection_records ADD COLUMN user_agent TEXT");
    },
  },
  {
    from: 15,
    to: 16,
    up(database) {
      // Where a guest can read what the operator does with the data. Empty for none.
      database.exec("ALTER TABLE settings ADD COLUMN privacy_notice_url TEXT NOT NULL DEFAULT ''");
    },
  },
  {
    from: 16,
    to: 17,
    up(database) {
      // How many days the log files keep their lines, they were only ever capped by size.
      database.exec("ALTER TABLE settings ADD COLUMN log_retention_days INTEGER NOT NULL DEFAULT 30 CHECK (log_retention_days BETWEEN 1 AND 365)");
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

import type { DatabaseSync } from "node:sqlite";

export const DATABASE_SCHEMA_VERSION = 10;

/** Relay name earlier builds stored when none was given, as escapes to keep CJK out of the file. */
const LEGACY_RELAY_NAME = "\u4e2d\u7ee7\u52a0\u901f";
const DEFAULT_RELAY_NAME = "Relay acceleration";

interface Migration {
  /** Schema version this step upgrades from, it leaves the database at from + 1. */
  from: number;
  up(database: DatabaseSync): void;
}

// Ordered and append-only. SQL in the templates keeps its indentation because SQLite stores
// CREATE statements verbatim.
const MIGRATIONS: Migration[] = [
  {
    from: 0,
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
          CREATE TABLE audit_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event TEXT NOT NULL,
            details_json TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
        `);
      const now = new Date().toISOString();
      database
        .prepare(
          `INSERT INTO settings (
             id, site_name, welcome_text, access_mode, ts_host, ts_port,
             ts_password_encrypted, detected_protocol, last_test_at,
             last_test_latency_ms, last_test_error, updated_at
           ) VALUES (1, 'WebSpeak', '', 'fixed', '127.0.0.1', 9987, NULL, NULL, NULL, NULL, NULL, ?)`,
        )
        .run(now);
      database.exec("PRAGMA user_version = 1");
    },
  },
  {
    from: 1,
    up(database) {
      database.exec(`
          CREATE TABLE managed_invites (
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
          );
          CREATE INDEX managed_invites_token_idx ON managed_invites(token_hash);
          CREATE INDEX managed_invites_expiry_idx ON managed_invites(expires_at);
        `);
      database.exec("PRAGMA user_version = 2");
    },
  },
  {
    from: 2,
    up(database) {
      database.exec(`
          -- WebRTC media ports are stored with the administrator settings so the
          -- same range is used by the gateway and shown in the admin console.
          ALTER TABLE settings ADD COLUMN webrtc_enabled INTEGER NOT NULL DEFAULT 0 CHECK (webrtc_enabled IN (0, 1));
          ALTER TABLE settings ADD COLUMN webrtc_public_host TEXT NOT NULL DEFAULT '';
          ALTER TABLE settings ADD COLUMN webrtc_udp_start INTEGER NOT NULL DEFAULT 40000 CHECK (webrtc_udp_start BETWEEN 1 AND 65535);
          ALTER TABLE settings ADD COLUMN webrtc_udp_end INTEGER NOT NULL DEFAULT 40099 CHECK (webrtc_udp_end BETWEEN 1 AND 65535);
        `);
      database.exec("PRAGMA user_version = 3");
    },
  },
  {
    from: 3,
    up(database) {
      database.exec(`
          ALTER TABLE settings ADD COLUMN welcome_text_en TEXT NOT NULL DEFAULT '';
        `);
      database.exec("PRAGMA user_version = 4");
    },
  },
  {
    from: 4,
    up(database) {
      database.exec(`
          ALTER TABLE settings ADD COLUMN relay_configured INTEGER NOT NULL DEFAULT 0 CHECK (relay_configured IN (0, 1));
          ALTER TABLE settings ADD COLUMN relay_enabled INTEGER NOT NULL DEFAULT 0 CHECK (relay_enabled IN (0, 1));
          ALTER TABLE settings ADD COLUMN relay_name TEXT NOT NULL DEFAULT '';
          ALTER TABLE settings ADD COLUMN relay_host TEXT NOT NULL DEFAULT '';
          ALTER TABLE settings ADD COLUMN relay_port INTEGER NOT NULL DEFAULT 39087 CHECK (relay_port BETWEEN 1 AND 65535);
          ALTER TABLE settings ADD COLUMN relay_token_encrypted TEXT;
        `);
      database.exec("PRAGMA user_version = 5");
    },
  },
  {
    from: 5,
    up(database) {
      database.exec(`
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
      const legacy = database
        .prepare(
          `SELECT relay_configured, relay_enabled, relay_name, relay_host, relay_port, relay_token_encrypted
           FROM settings WHERE id = 1`,
        )
        .get() as
        | {
            relay_configured?: number;
            relay_enabled?: number;
            relay_name?: string;
            relay_host?: string;
            relay_port?: number;
            relay_token_encrypted?: string | null;
          }
        | undefined;
      if (legacy?.relay_configured === 1 && legacy.relay_host && legacy.relay_token_encrypted) {
        const now = new Date().toISOString();
        database
          .prepare(
            `INSERT INTO relay_nodes (id, name, enabled, host, port, token_encrypted, created_at, updated_at)
             VALUES ('relay-default', ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            legacy.relay_name || DEFAULT_RELAY_NAME,
            legacy.relay_enabled === 1 ? 1 : 0,
            legacy.relay_host,
            legacy.relay_port || 39087,
            legacy.relay_token_encrypted,
            now,
            now,
          );
      }
      database.exec("PRAGMA user_version = 6");
    },
  },
  {
    from: 6,
    up(database) {
      database.exec(`
          ALTER TABLE settings ADD COLUMN welcome_text_de TEXT NOT NULL DEFAULT '';
          ALTER TABLE settings ADD COLUMN welcome_text_ru TEXT NOT NULL DEFAULT '';
          ALTER TABLE settings ADD COLUMN welcome_text_ja TEXT NOT NULL DEFAULT '';
        `);
      database.exec("PRAGMA user_version = 7");
    },
  },
  {
    from: 7,
    up(database) {
      // Welcome texts become rows keyed by language code, so a new language needs no schema change.
      // Only English and German carry over, the other languages stay in the schema-7 backup.
      database.exec(`
          CREATE TABLE welcome_texts (
            language TEXT PRIMARY KEY,
            text TEXT NOT NULL
          );
          INSERT INTO welcome_texts (language, text)
            SELECT 'en', welcome_text_en FROM settings WHERE id = 1 AND trim(welcome_text_en) <> '';
          INSERT INTO welcome_texts (language, text)
            SELECT 'de', welcome_text_de FROM settings WHERE id = 1 AND trim(welcome_text_de) <> '';
          ALTER TABLE settings DROP COLUMN welcome_text;
          ALTER TABLE settings DROP COLUMN welcome_text_en;
          ALTER TABLE settings DROP COLUMN welcome_text_de;
          ALTER TABLE settings DROP COLUMN welcome_text_ru;
          ALTER TABLE settings DROP COLUMN welcome_text_ja;
        `);
      // Stored defaults of the old Chinese build.
      for (const table of ["relay_nodes", "settings"] as const) {
        const column = table === "relay_nodes" ? "name" : "relay_name";
        database.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`).run(DEFAULT_RELAY_NAME, LEGACY_RELAY_NAME);
      }
      database.exec("PRAGMA user_version = 8");
    },
  },
  {
    from: 8,
    up(database) {
      // Identity mint back-pressure limits live with the administrator settings, read live by the
      // mint endpoint and edited in the admin console.
      database.exec(`
          ALTER TABLE settings ADD COLUMN identity_mint_max_level INTEGER NOT NULL DEFAULT 8 CHECK (identity_mint_max_level BETWEEN 1 AND 24);
          ALTER TABLE settings ADD COLUMN identity_mint_concurrency INTEGER NOT NULL DEFAULT 2 CHECK (identity_mint_concurrency BETWEEN 1 AND 8);
          ALTER TABLE settings ADD COLUMN identity_mint_queue_depth INTEGER NOT NULL DEFAULT 20 CHECK (identity_mint_queue_depth BETWEEN 0 AND 100);
        `);
      database.exec("PRAGMA user_version = 9");
    },
  },
  {
    from: 9,
    up(database) {
      // The single target becomes a list. The old one moves over as the first server, named after the site.
      database.exec(`
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
          INSERT INTO ts_servers (id, name, host, port, password_encrypted, position, last_test_at, last_test_latency_ms, last_test_error, created_at, updated_at)
            SELECT 'server-default', site_name, ts_host, ts_port, ts_password_encrypted, 0, last_test_at, last_test_latency_ms, last_test_error, updated_at, updated_at
            FROM settings WHERE id = 1;
          ALTER TABLE managed_invites ADD COLUMN server_id TEXT;
          UPDATE managed_invites SET server_id = 'server-default';
          ALTER TABLE settings DROP COLUMN ts_host;
          ALTER TABLE settings DROP COLUMN ts_port;
          ALTER TABLE settings DROP COLUMN ts_password_encrypted;
          ALTER TABLE settings DROP COLUMN detected_protocol;
          ALTER TABLE settings DROP COLUMN last_test_at;
          ALTER TABLE settings DROP COLUMN last_test_latency_ms;
          ALTER TABLE settings DROP COLUMN last_test_error;
        `);
      database.exec("PRAGMA user_version = 10");
    },
  },
];

/** Applies every migration newer than version, each in its own transaction. */
export function runMigrations(database: DatabaseSync, version: number, transaction: (action: () => void) => void): void {
  for (const migration of MIGRATIONS) {
    if (migration.from !== version) continue;
    transaction(() => migration.up(database));
    version += 1;
  }
}

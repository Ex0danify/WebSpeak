import { DatabaseSync } from "node:sqlite";
import { mkdirSyncFor } from "./database.js";

// The schema a fresh database got at schema 13, before sessions got a category, a table and the retention settings.
const SCHEMA_13 = `
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
            category TEXT NOT NULL DEFAULT 'system' CHECK (category IN ('auth', 'config', 'invites', 'availability', 'system')),
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
`;

/** A schema 13 database with a row in every table and event log rows that already carry a category and a severity. */
export function createSchema13Database(file: string): void {
  mkdirSyncFor(file);
  const raw = new DatabaseSync(file);
  raw.exec(SCHEMA_13);
  raw.exec(`
    INSERT INTO settings (id, site_name, access_mode, updated_at, webrtc_enabled, webrtc_udp_start, webrtc_udp_end)
      VALUES (1, 'Eleven', 'open', '2024-03-04T00:00:00.000Z', 1, 41000, 41010);
    INSERT INTO ts_servers (id, name, host, port, password_encrypted, position, created_at, updated_at)
      VALUES ('server-default', 'Eleven', 'eleven.example.org', 9011, 'enc:ts-password', 0, '2024-03-04T00:00:00.000Z', '2024-03-04T00:00:00.000Z'),
             ('server-b', 'Other', 'other.example.org', 9987, NULL, 1, '2024-03-04T00:00:00.000Z', '2024-03-04T00:00:00.000Z');
    INSERT INTO welcome_texts (language, text) VALUES ('en', 'Welcome'), ('de', 'Willkommen');
    INSERT INTO relay_nodes (id, name, enabled, host, port, token_encrypted, created_at, updated_at)
      VALUES ('relay-a', 'Frankfurt', 1, 'relay.example.org', 39100, 'enc:relay', '2024-01-01T00:00:00.000Z', '2024-01-02T00:00:00.000Z');
    INSERT INTO metadata (key, value) VALUES ('visitor_count', '41');
    INSERT INTO admin_credentials (id, credential_json, created_at, updated_at)
      VALUES (1, '{"version":1,"username":"root","salt":"c2FsdA","hash":"aGFzaA"}', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
    INSERT INTO audit_events (event, category, severity, details_json, created_at) VALUES
      ('ADMIN_INITIALIZED', 'system', 'info', '{"accessMode":"open"}', '2024-01-01T00:00:00.000Z'),
      ('ADMIN_LOGIN_FAILED', 'auth', 'warning', '{}', '2024-01-03T00:00:00.000Z'),
      ('SERVER_UNAVAILABLE', 'availability', 'error', '{"code":"TIMEOUT"}', '2024-01-05T00:00:00.000Z'),
      ('INVITE_CREATED', 'invites', 'info', '{"id":"invite-1"}', '2024-01-06T00:00:00.000Z');
    INSERT INTO managed_invites (id, server_id, token_hash, target_host, target_port, server_password_encrypted, channel, expires_at, max_uses, use_count, created_at, revoked_at)
      VALUES ('invite-1', 'server-default', 'hash-1', 'eleven.example.org', 9011, 'enc:invite-password', 'Lobby', '2030-01-01T00:00:00.000Z', 5, 2, '2024-01-01T00:00:00.000Z', NULL),
             ('invite-2', 'server-b', 'hash-2', 'other.example.org', 9987, NULL, '', '2030-01-01T00:00:00.000Z', 0, 0, '2024-01-02T00:00:00.000Z', '2024-01-03T00:00:00.000Z'),
             ('invite-3', 'server-gone', 'hash-3', 'gone.example.org', 9987, NULL, '', '2024-02-01T00:00:00.000Z', 1, 1, '2024-01-04T00:00:00.000Z', NULL);
    PRAGMA user_version = 13;
  `);
  raw.close();
}

import { openSeedDatabase } from "./database.js";

// The schema exactly as 0.7.0 created it, statement text included, so the schema 11 migration runs on the real DDL.
const SCHEMA_10 = `
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
            updated_at TEXT NOT NULL
          , webrtc_enabled INTEGER NOT NULL DEFAULT 0 CHECK (webrtc_enabled IN (0, 1)), webrtc_public_host TEXT NOT NULL DEFAULT '', webrtc_udp_start INTEGER NOT NULL DEFAULT 40000 CHECK (webrtc_udp_start BETWEEN 1 AND 65535), webrtc_udp_end INTEGER NOT NULL DEFAULT 40099 CHECK (webrtc_udp_end BETWEEN 1 AND 65535), relay_configured INTEGER NOT NULL DEFAULT 0 CHECK (relay_configured IN (0, 1)), relay_enabled INTEGER NOT NULL DEFAULT 0 CHECK (relay_enabled IN (0, 1)), relay_name TEXT NOT NULL DEFAULT '', relay_host TEXT NOT NULL DEFAULT '', relay_port INTEGER NOT NULL DEFAULT 39087 CHECK (relay_port BETWEEN 1 AND 65535), relay_token_encrypted TEXT, identity_mint_max_level INTEGER NOT NULL DEFAULT 8 CHECK (identity_mint_max_level BETWEEN 1 AND 24), identity_mint_concurrency INTEGER NOT NULL DEFAULT 2 CHECK (identity_mint_concurrency BETWEEN 1 AND 8), identity_mint_queue_depth INTEGER NOT NULL DEFAULT 20 CHECK (identity_mint_queue_depth BETWEEN 0 AND 100));
CREATE TABLE audit_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event TEXT NOT NULL,
            details_json TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
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
          , server_id TEXT);
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
`;

/** A 0.7.0 database (schema 10) with a row in every table, the single-relay columns and the WebRTC public host filled. */
export function createSchema10Database(file: string): void {
  const raw = openSeedDatabase(file);
  raw.exec(SCHEMA_10);
  raw.exec(`
    INSERT INTO settings (id, site_name, access_mode, updated_at, webrtc_enabled, webrtc_public_host, webrtc_udp_start, webrtc_udp_end,
      relay_configured, relay_enabled, relay_name, relay_host, relay_port, relay_token_encrypted)
      VALUES (1, 'Ten', 'open', '2024-03-04T00:00:00.000Z', 1, 'pub.example.org', 41000, 41010,
      1, 1, 'Frankfurt', 'relay.example.org', 39100, 'enc:relay');
    INSERT INTO ts_servers (id, name, host, port, password_encrypted, position, last_test_at, last_test_latency_ms, created_at, updated_at)
      VALUES ('server-default', 'Ten', 'ten.example.org', 9010, 'enc:ts-password', 0, '2024-03-03T00:00:00.000Z', 12,
      '2024-03-04T00:00:00.000Z', '2024-03-04T00:00:00.000Z');
    INSERT INTO welcome_texts (language, text) VALUES ('en', 'Welcome'), ('de', 'Willkommen');
    INSERT INTO relay_nodes (id, name, enabled, host, port, token_encrypted, created_at, updated_at)
      VALUES ('relay-a', 'Frankfurt', 1, 'relay.example.org', 39100, 'enc:relay', '2024-01-01T00:00:00.000Z', '2024-01-02T00:00:00.000Z');
    INSERT INTO metadata (key, value) VALUES ('legacy_config_checked', '1'), ('visitor_count', '41');
    INSERT INTO admin_credentials (id, credential_json, created_at, updated_at)
      VALUES (1, '{"version":1,"username":"root","salt":"c2FsdA","hash":"aGFzaA"}', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
    INSERT INTO audit_events (event, details_json, created_at)
      VALUES ('ADMIN_INITIALIZED', '{"accessMode":"open"}', '2024-01-01T00:00:00.000Z'), ('SETTINGS_CHANGED', '{}', '2024-01-02T00:00:00.000Z');
    INSERT INTO managed_invites (id, server_id, token_hash, target_host, target_port, server_password_encrypted, channel, expires_at, max_uses, use_count, created_at)
      VALUES ('invite-1', 'server-default', 'hash-1', 'ten.example.org', 9010, 'enc:invite-password', 'Lobby', '2030-01-01T00:00:00.000Z', 5, 2, '2024-01-01T00:00:00.000Z');
    PRAGMA user_version = 10;
  `);
  raw.close();
}

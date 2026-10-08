import { existsSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { mkdirSyncFor, useDatabaseFixture } from "../../../test/helpers/database.js";
import { DATABASE_SCHEMA_VERSION, WebSpeakDatabase } from "./database.js";

const fx = useDatabaseFixture();

/** Builds a database as an old build left it: schema 1, plus the later ALTERs up to `version`. */
function createLegacyDatabase(file: string, version: 1 | 5, relay?: { name: string; host: string; port: number; token: string }): void {
  const raw = new DatabaseSync(file);
  raw.exec(`
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE admin_credentials (id INTEGER PRIMARY KEY CHECK (id = 1), credential_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE settings (
      id INTEGER PRIMARY KEY CHECK (id = 1), site_name TEXT NOT NULL, welcome_text TEXT NOT NULL,
      access_mode TEXT NOT NULL CHECK (access_mode IN ('fixed', 'open')), ts_host TEXT NOT NULL,
      ts_port INTEGER NOT NULL CHECK (ts_port BETWEEN 1 AND 65535), ts_password_encrypted TEXT,
      detected_protocol TEXT, last_test_at TEXT, last_test_latency_ms INTEGER, last_test_error TEXT, updated_at TEXT NOT NULL
    );
    CREATE TABLE audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT NOT NULL, details_json TEXT NOT NULL, created_at TEXT NOT NULL);
    INSERT INTO settings (id, site_name, welcome_text, access_mode, ts_host, ts_port, updated_at)
      VALUES (1, 'Legacy site', 'legacy welcome', 'open', 'legacy.example.org', 9000, '2024-01-01T00:00:00.000Z');
    PRAGMA user_version = 1;
  `);
  if (version === 5) {
    raw.exec(`
      CREATE TABLE managed_invites (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, target_host TEXT NOT NULL, target_port INTEGER NOT NULL,
        server_password_encrypted TEXT, channel TEXT NOT NULL DEFAULT '', expires_at TEXT NOT NULL, max_uses INTEGER NOT NULL,
        use_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, revoked_at TEXT);
      ALTER TABLE settings ADD COLUMN webrtc_enabled INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE settings ADD COLUMN webrtc_public_host TEXT NOT NULL DEFAULT '';
      ALTER TABLE settings ADD COLUMN webrtc_udp_start INTEGER NOT NULL DEFAULT 40000;
      ALTER TABLE settings ADD COLUMN webrtc_udp_end INTEGER NOT NULL DEFAULT 40099;
      ALTER TABLE settings ADD COLUMN welcome_text_en TEXT NOT NULL DEFAULT '';
      ALTER TABLE settings ADD COLUMN relay_configured INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE settings ADD COLUMN relay_enabled INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE settings ADD COLUMN relay_name TEXT NOT NULL DEFAULT '';
      ALTER TABLE settings ADD COLUMN relay_host TEXT NOT NULL DEFAULT '';
      ALTER TABLE settings ADD COLUMN relay_port INTEGER NOT NULL DEFAULT 39087;
      ALTER TABLE settings ADD COLUMN relay_token_encrypted TEXT;
      PRAGMA user_version = 5;
    `);
    if (relay) {
      raw.prepare(
        "UPDATE settings SET relay_configured = 1, relay_enabled = 1, relay_name = ?, relay_host = ?, relay_port = ?, relay_token_encrypted = ? WHERE id = 1",
      ).run(relay.name, relay.host, relay.port, relay.token);
    }
  }
  raw.close();
}

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
      tsHost: "127.0.0.1",
      tsPort: 9987,
      tsPasswordEncrypted: null,
      detectedProtocol: null,
      lastTestAt: null,
      webRtcEnabled: false,
      webRtcUdpStart: 40000,
      webRtcUdpEnd: 40099,
      relayConfigured: false,
      relayPort: 39087,
    });
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

  it("upgrades a schema 1 database to the current one and keeps its settings", () => {
    mkdirSyncFor(fx.path);
    createLegacyDatabase(fx.path, 1);
    const database = fx.open();
    expect(database.schemaVersion).toBe(DATABASE_SCHEMA_VERSION);
    expect(database.getSettings()).toMatchObject({
      siteName: "Legacy site",
      welcomeTexts: {},
      accessMode: "open",
      tsHost: "legacy.example.org",
      tsPort: 9000,
      webRtcUdpStart: 40000,
      relayConfigured: false,
    });
    expect(database.listRelayNodes()).toEqual([]);
    // The tables added by later migrations are usable.
    expect(database.listManagedInvites()).toEqual([]);
  });

  it("copies the old file to a .bak named after the old schema before upgrading", () => {
    mkdirSyncFor(fx.path);
    createLegacyDatabase(fx.path, 1);
    fx.open();
    const backup = new DatabaseSync(`${fx.path}.schema-1.bak`);
    try {
      expect((backup.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(1);
    } finally {
      backup.close();
    }
  });

  it("moves a configured single relay from schema 5 into relay_nodes as relay-default", () => {
    mkdirSyncFor(fx.path);
    createLegacyDatabase(fx.path, 5, { name: "Frankfurt", host: "relay.example.org", port: 39100, token: "enc:relay" });
    const nodes = fx.open().listRelayNodes();
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ id: "relay-default", name: "Frankfurt", enabled: true, host: "relay.example.org", port: 39100, tokenEncrypted: "enc:relay" });
  });

  it("names a schema 5 relay that had no name with the English default", () => {
    mkdirSyncFor(fx.path);
    createLegacyDatabase(fx.path, 5, { name: "", host: "relay.example.org", port: 39100, token: "enc:relay" });
    expect(fx.open().listRelayNodes()[0]).toMatchObject({ id: "relay-default", name: "Relay acceleration" });
  });

  it("does not create a relay node when the legacy relay has no host or token", () => {
    mkdirSyncFor(fx.path);
    createLegacyDatabase(fx.path, 5);
    expect(fx.open().listRelayNodes()).toEqual([]);
  });

  it("refuses a database written by a newer build", () => {
    mkdirSyncFor(fx.path);
    const raw = new DatabaseSync(fx.path);
    raw.exec(`PRAGMA user_version = ${DATABASE_SCHEMA_VERSION + 1}`);
    raw.close();
    expect(() => new WebSpeakDatabase(fx.path)).toThrow(/newer than this WebSpeak build/);
  });
});

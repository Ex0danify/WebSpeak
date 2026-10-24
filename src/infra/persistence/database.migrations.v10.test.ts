import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { useDatabaseFixture } from "../../../test/support/database.js";

const fx = useDatabaseFixture();

/** A current database turned back into schema 10: the single-relay columns are there again, mirroring the first node. */
function createSchema10Database(file: string): void {
  fx.open().close();
  const raw = new DatabaseSync(file);
  raw.exec(`
    ALTER TABLE settings ADD COLUMN relay_configured INTEGER NOT NULL DEFAULT 0 CHECK (relay_configured IN (0, 1));
    ALTER TABLE settings ADD COLUMN relay_enabled INTEGER NOT NULL DEFAULT 0 CHECK (relay_enabled IN (0, 1));
    ALTER TABLE settings ADD COLUMN relay_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE settings ADD COLUMN relay_host TEXT NOT NULL DEFAULT '';
    ALTER TABLE settings ADD COLUMN relay_port INTEGER NOT NULL DEFAULT 39087 CHECK (relay_port BETWEEN 1 AND 65535);
    ALTER TABLE settings ADD COLUMN relay_token_encrypted TEXT;
    UPDATE settings SET site_name = 'Ten', relay_configured = 1, relay_enabled = 1, relay_name = 'Frankfurt',
      relay_host = 'relay.example.org', relay_port = 39100, relay_token_encrypted = 'enc:relay' WHERE id = 1;
    INSERT INTO relay_nodes (id, name, enabled, host, port, token_encrypted, created_at, updated_at)
      VALUES ('relay-a', 'Frankfurt', 1, 'relay.example.org', 39100, 'enc:relay', '2024-01-01T00:00:00.000Z', '2024-01-02T00:00:00.000Z');
    INSERT INTO metadata (key, value) VALUES ('legacy_config_checked', '1'), ('visitor_count', '7');
    PRAGMA user_version = 10;
  `);
  raw.close();
}

function settingsColumns(file: string): string[] {
  const raw = new DatabaseSync(file, { readOnly: true });
  try {
    return (raw.prepare("PRAGMA table_info(settings)").all() as Array<{ name: string }>).map((column) => column.name);
  } finally {
    raw.close();
  }
}

describe("schema 11 migration (single-relay columns dropped)", () => {
  it("drops the six columns, including the ones with a CHECK, and keeps every other setting", () => {
    createSchema10Database(fx.path);
    expect(settingsColumns(fx.path)).toContain("relay_port");
    const database = fx.open();
    database.close();
    expect(settingsColumns(fx.path).filter((name) => name.startsWith("relay_"))).toEqual([]);
    expect(fx.open().getSettings()).toMatchObject({ siteName: "Ten", webRtcUdpStart: 40000, identityMintQueueDepth: 20 });
  });

  it("leaves the relay nodes alone", () => {
    createSchema10Database(fx.path);
    expect(fx.open().listRelayNodes()).toMatchObject([
      { id: "relay-a", name: "Frankfurt", enabled: true, host: "relay.example.org", port: 39100, tokenEncrypted: "enc:relay" },
    ]);
  });

  it("removes the stale legacy config marker and keeps the other metadata", () => {
    createSchema10Database(fx.path);
    const database = fx.open();
    expect(database.getMeta("legacy_config_checked")).toBeNull();
    expect(database.getMeta("visitor_count")).toBe("7");
  });

  it("writes the schema 10 backup first, and it still holds the columns", () => {
    createSchema10Database(fx.path);
    fx.open().close();
    expect(existsSync(`${fx.path}.schema-10.bak`)).toBe(true);
    expect(settingsColumns(`${fx.path}.schema-10.bak`)).toContain("relay_token_encrypted");
  });
});

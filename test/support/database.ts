import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, vi } from "vitest";
import type { AdminCredential } from "../../src/infra/security/adminPassword.js";
import { type ManagedInviteRecord, type SettingsUpdate, WebSpeakDatabase } from "../../src/infra/persistence/database.js";

export interface DatabaseFixture {
  readonly dir: string;
  readonly path: string;
  /** Opens a database that is closed after the test. */
  open(file?: string): WebSpeakDatabase;
}

/** Registers hooks that give every test a fresh temporary directory and close what it opened. */
export function useDatabaseFixture(): DatabaseFixture {
  let root = "";
  let opened: WebSpeakDatabase[] = [];
  const fixture: DatabaseFixture = {
    get dir() {
      return join(root, "nested");
    },
    get path() {
      return join(root, "nested", "webspeak.db");
    },
    open(file = fixture.path) {
      const database = new WebSpeakDatabase(file, { synchronous: "off" });
      opened.push(database);
      return database;
    },
  };
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "webspeak-database-"));
    opened = [];
  });
  afterEach(() => {
    vi.useRealTimers();
    for (const database of opened) {
      try {
        database.close();
      } catch {
        /* already closed by the test */
      }
    }
    rmSync(root, { recursive: true, force: true });
  });
  return fixture;
}

export function mkdirSyncFor(file: string): void {
  mkdirSync(dirname(file), { recursive: true });
}

/** A plain connection for building old-schema files. Without fsync, since every statement is its own commit and Windows CI disks are slow. */
export function openSeedDatabase(file: string): DatabaseSync {
  mkdirSyncFor(file);
  const raw = new DatabaseSync(file);
  raw.exec("PRAGMA synchronous = OFF;");
  return raw;
}

export const credential: AdminCredential = {
  version: 1,
  username: "root",
  mustChangePassword: true,
  salt: "c2FsdA",
  hash: "aGFzaA",
  parameters: { N: 32768, r: 8, p: 1 },
};

export function settings(overrides: Partial<SettingsUpdate> = {}): SettingsUpdate {
  return {
    siteName: "Test site",
    welcomeTexts: { en: "en", de: "de" },
    accessMode: "open",
    webRtcEnabled: true,
    webRtcUdpStart: 41000,
    webRtcUdpEnd: 41010,
    ...overrides,
  };
}

export function invite(id: string, overrides: Partial<Omit<ManagedInviteRecord, "createdAt" | "revokedAt" | "useCount">> = {}) {
  return {
    id,
    serverId: "server-default",
    tokenHash: `hash-${id}`,
    targetHost: "ts.example.org",
    targetPort: 9987,
    serverPasswordEncrypted: null,
    channel: "",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    maxUses: 1,
    ...overrides,
  };
}

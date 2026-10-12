import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AdminCredential } from "../security/adminPassword.js";
import type { TeamSpeakProtocol } from "../../shared/teamSpeakProtocol.js";
import { DATABASE_SCHEMA_VERSION, runMigrations } from "./databaseMigrations.js";
import type { ManagedInviteRecord, PersistedRelayNode, PersistedSettings, SettingsUpdate } from "./databaseTypes.js";
import { AdminCredentialRepository } from "./adminCredentialRepository.js";
import { AuditRepository } from "./auditRepository.js";
import { ManagedInviteRepository } from "./managedInviteRepository.js";
import { MetaRepository } from "./metaRepository.js";
import { RelayNodeRepository } from "./relayNodeRepository.js";
import { SettingsRepository } from "./settingsRepository.js";

export { DATABASE_SCHEMA_VERSION };
export type { AccessMode, ManagedInviteRecord, PersistedRelayNode, PersistedSettings, SettingsUpdate } from "./databaseTypes.js";

export class WebSpeakDatabase {
  private readonly database: DatabaseSync;
  private readonly adminCredentials: AdminCredentialRepository;
  private readonly settings: SettingsRepository;
  private readonly relayNodes: RelayNodeRepository;
  private readonly managedInvites: ManagedInviteRepository;
  private readonly audit: AuditRepository;
  private readonly meta: MetaRepository;

  constructor(private readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
    const existed = existsSync(path);
    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    const context = { database: this.database, transaction: (action: () => void) => this.transaction(action) };
    this.adminCredentials = new AdminCredentialRepository(context);
    this.settings = new SettingsRepository(context);
    this.relayNodes = new RelayNodeRepository(context);
    this.managedInvites = new ManagedInviteRepository(context);
    this.audit = new AuditRepository(context);
    this.meta = new MetaRepository(context);
    this.migrate(existed);
  }

  close(): void {
    this.database.close();
  }

  get schemaVersion(): number {
    return Number((this.database.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
  }

  hasAdmin(): boolean {
    return this.adminCredentials.has();
  }

  getAdminCredential(): AdminCredential | null {
    return this.adminCredentials.get();
  }

  initializeAdmin(credential: AdminCredential, settings: SettingsUpdate): void {
    this.transaction(() => {
      if (this.hasAdmin()) throw new Error("WebSpeak is already initialized");
      const now = new Date().toISOString();
      this.adminCredentials.insert(credential, now);
      this.settings.write(settings, now);
      this.audit.insert("ADMIN_INITIALIZED", { accessMode: settings.accessMode, target: `${settings.tsHost}:${settings.tsPort}` }, now);
    });
  }

  updateAdminCredential(credential: AdminCredential): void {
    this.adminCredentials.update(credential);
  }

  getSettings(): PersistedSettings {
    return this.settings.get();
  }

  listRelayNodes(): PersistedRelayNode[] {
    return this.relayNodes.list();
  }

  replaceRelayNodes(nodes: Array<Omit<PersistedRelayNode, "createdAt" | "updatedAt"> & { createdAt?: string; updatedAt?: string }>): void {
    this.relayNodes.replace(nodes);
  }

  updateSettings(settings: SettingsUpdate, auditEvent = "SETTINGS_CHANGED"): void {
    const now = new Date().toISOString();
    this.transaction(() => {
      this.settings.write(settings, now);
      this.audit.insert(auditEvent, { accessMode: settings.accessMode, target: `${settings.tsHost}:${settings.tsPort}` }, now);
    });
  }

  recordConnectionTest(result: { protocol: TeamSpeakProtocol | null; latencyMs: number | null; error: string | null }): void {
    this.settings.recordConnectionTest(result);
  }

  clearConnectionTest(): void {
    this.settings.clearConnectionTest();
  }

  createManagedInvite(record: Omit<ManagedInviteRecord, "createdAt" | "revokedAt" | "useCount">): ManagedInviteRecord {
    return this.managedInvites.create(record);
  }

  listManagedInvites(): ManagedInviteRecord[] {
    return this.managedInvites.list();
  }

  revokeManagedInvite(id: string): boolean {
    return this.managedInvites.revoke(id);
  }

  consumeManagedInvite(tokenHash: string, now = Date.now()): ManagedInviteRecord | null {
    return this.managedInvites.consume(tokenHash, now);
  }

  exportBackup(): Buffer {
    const exportPath = `${this.path}.export-${randomBytes(8).toString("hex")}.db`;
    try {
      const escapedPath = exportPath.replaceAll("'", "''");
      this.database.exec(`VACUUM INTO '${escapedPath}'`);
      return readFileSync(exportPath);
    } finally {
      try {
        unlinkSync(exportPath);
      } catch {
        /* best effort cleanup */
      }
    }
  }

  getMeta(key: string): string | null {
    return this.meta.get(key);
  }

  setMeta(key: string, value: string): void {
    this.meta.set(key, value);
  }

  nextVisitorNumber(): number {
    return this.meta.nextVisitorNumber();
  }

  getVisitorCount(): number {
    return this.meta.getVisitorCount();
  }

  addAudit(event: string, details: Record<string, unknown> = {}): void {
    this.audit.insert(event, details, new Date().toISOString());
  }

  /** The audit log only grows, so startup trims it to the newest rows. */
  pruneAudit(keep = 5000): number {
    return this.audit.prune(keep);
  }

  recentAudit(limit = 8): Array<{ event: string; createdAt: string }> {
    return this.audit.recent(limit);
  }

  private migrate(existed: boolean): void {
    const version = this.schemaVersion;
    if (version > DATABASE_SCHEMA_VERSION) {
      throw new Error(`Database schema ${version} is newer than this WebSpeak build`);
    }
    if (existed && version > 0) {
      this.writeSchemaBackup(`${this.path}.schema-${version}.bak`);
    }
    runMigrations(this.database, version, (action) => this.transaction(action));
  }

  /** VACUUM INTO reads a consistent snapshot including the WAL, unlike copying the main file. */
  private writeSchemaBackup(target: string): void {
    rmSync(target, { force: true });
    this.database.prepare("VACUUM INTO ?").run(target);
    try {
      chmodSync(target, 0o600);
    } catch {
      // Windows and some container filesystems do not expose POSIX permissions.
    }
  }

  private transaction(action: () => void): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      action();
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

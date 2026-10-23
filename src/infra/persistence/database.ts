import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AdminCredential } from "../security/adminPassword.js";
import { DATABASE_SCHEMA_VERSION, runMigrations } from "./databaseMigrations.js";
import type { ManagedInviteRecord, PersistedRelayNode, PersistedServer, PersistedSettings, SettingsUpdate } from "./databaseTypes.js";
import { AdminCredentialRepository } from "./adminCredentialRepository.js";
import { AuditRepository } from "./auditRepository.js";
import { ManagedInviteRepository } from "./managedInviteRepository.js";
import { MetaRepository } from "./metaRepository.js";
import { RelayNodeRepository } from "./relayNodeRepository.js";
import { ServerRepository } from "./serverRepository.js";
import { SettingsRepository } from "./settingsRepository.js";

export { DATABASE_SCHEMA_VERSION };
export type {
  AccessMode,
  ManagedInviteRecord,
  PersistedRelayNode,
  PersistedServer,
  PersistedSettings,
  SettingsUpdate,
} from "./databaseTypes.js";

const ADMIN_SESSION_EPOCH_KEY = "admin_session_epoch";

export class WebSpeakDatabase {
  private readonly database: DatabaseSync;
  private readonly adminCredentials: AdminCredentialRepository;
  private readonly settings: SettingsRepository;
  private readonly servers: ServerRepository;
  private readonly relayNodes: RelayNodeRepository;
  private readonly managedInvites: ManagedInviteRepository;
  private readonly audit: AuditRepository;
  private readonly meta: MetaRepository;

  constructor(private readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
    const existed = existsSync(path);
    this.database = new DatabaseSync(path);
    try {
      this.database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
      const context = { database: this.database, transaction: (action: () => void) => this.transaction(action) };
      this.adminCredentials = new AdminCredentialRepository(context);
      this.settings = new SettingsRepository(context);
      this.servers = new ServerRepository(context);
      this.relayNodes = new RelayNodeRepository(context);
      this.managedInvites = new ManagedInviteRepository(context);
      this.audit = new AuditRepository(context);
      this.meta = new MetaRepository(context);
      this.migrate(existed);
    } catch (error) {
      // A failed migration must not leak the open handle, or Windows cannot unlink the file.
      this.database.close();
      throw error;
    }
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
      this.audit.insert("ADMIN_INITIALIZED", { accessMode: settings.accessMode }, now);
    });
  }

  updateAdminCredential(credential: AdminCredential): void {
    this.adminCredentials.update(credential);
  }

  /**
   * Replaces the account from outside the running gateway (the reset command). A new session epoch signs every
   * session out, a running gateway reads it on each request.
   */
  resetAdminCredential(credential: AdminCredential): void {
    this.transaction(() => {
      this.adminCredentials.update(credential);
      this.meta.set(ADMIN_SESSION_EPOCH_KEY, randomBytes(12).toString("hex"));
      this.audit.insert("ADMIN_PASSWORD_RESET", { username: credential.username }, new Date().toISOString());
    });
  }

  /** Changes whenever the account is reset, a session from before that is no longer valid. */
  getAdminSessionEpoch(): string {
    return this.meta.get(ADMIN_SESSION_EPOCH_KEY) ?? "";
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
      this.audit.insert(auditEvent, { accessMode: settings.accessMode }, now);
    });
  }

  listServers(): PersistedServer[] {
    return this.servers.list();
  }

  getServer(id: string): PersistedServer | null {
    return this.servers.get(id);
  }

  addServer(server: Pick<PersistedServer, "id" | "name" | "host" | "port" | "passwordEncrypted">): void {
    const now = new Date().toISOString();
    this.transaction(() => {
      this.servers.insert(server, now);
      this.audit.insert("SERVER_ADDED", { id: server.id, name: server.name, target: `${server.host}:${server.port}` }, now);
    });
  }

  /** An edit of the address or password revokes the invites made for the server, they carry a copy of both. */
  updateServer(server: Pick<PersistedServer, "id" | "name" | "host" | "port" | "passwordEncrypted">, connectionChanged: boolean): void {
    const now = new Date().toISOString();
    let revoked = 0;
    this.transaction(() => {
      this.servers.update(server, now, connectionChanged);
      if (connectionChanged) revoked = this.managedInvites.revokeForServer(server.id);
      this.audit.insert(
        "SERVER_UPDATED",
        { id: server.id, name: server.name, target: `${server.host}:${server.port}`, revokedInvites: revoked },
        now,
      );
    });
  }

  reorderServers(ids: string[]): void {
    const now = new Date().toISOString();
    this.transaction(() => {
      this.servers.reorder(ids);
      this.audit.insert("SERVERS_REORDERED", { count: ids.length }, now);
    });
  }

  removeServer(id: string): boolean {
    const now = new Date().toISOString();
    let removed = false;
    this.transaction(() => {
      removed = this.servers.delete(id);
      if (!removed) return;
      const revoked = this.managedInvites.revokeForServer(id);
      this.audit.insert("SERVER_REMOVED", { id, revokedInvites: revoked }, now);
    });
    return removed;
  }

  recordConnectionTest(id: string, result: { latencyMs: number | null; error: string | null }): void {
    this.servers.recordTest(id, result);
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

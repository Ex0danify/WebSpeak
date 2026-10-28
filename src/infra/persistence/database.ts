import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AdminCredential } from "../security/adminPassword.js";
import { DATABASE_SCHEMA_VERSION, MINIMUM_SCHEMA_VERSION, runMigrations } from "./databaseMigrations.js";
import type { ManagedInviteRecord, PersistedRelayNode, PersistedServer, PersistedSettings, SettingsUpdate } from "./databaseTypes.js";
import { AdminCredentialRepository } from "./adminCredentialRepository.js";
import { AuditRepository, type AuditEntry, type AuditQuery } from "./auditRepository.js";
import { ManagedInviteRepository, type ManagedInviteListOptions, type ManagedInviteStatus } from "./managedInviteRepository.js";
import {
  ConnectionRepository,
  type ConnectionFinish,
  type ConnectionQuery,
  type ConnectionRecord,
  type ConnectionStart,
} from "./connectionRepository.js";
import { MetaRepository } from "./metaRepository.js";
import { RelayNodeRepository } from "./relayNodeRepository.js";
import { ServerRepository } from "./serverRepository.js";
import { SettingsRepository } from "./settingsRepository.js";

export { DATABASE_SCHEMA_VERSION };
export type { ConnectionAudioPath, ConnectionAudioSummary, ConnectionIceSummary, ConnectionRecord, ConnectionStatus } from "./connectionRepository.js";
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
  private readonly connections: ConnectionRepository;
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
      this.connections = new ConnectionRepository(context);
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

  updateSettings(settings: SettingsUpdate, auditDetails: Record<string, unknown> = {}): void {
    const now = new Date().toISOString();
    this.transaction(() => {
      this.settings.write(settings, now);
      this.audit.insert("SETTINGS_CHANGED", { accessMode: settings.accessMode, ...auditDetails }, now);
    });
  }

  listServers(): PersistedServer[] {
    return this.servers.list();
  }

  getServer(id: string): PersistedServer | null {
    return this.servers.get(id);
  }

  addServer(
    server: Pick<PersistedServer, "id" | "name" | "host" | "port" | "passwordEncrypted">,
    auditDetails: Record<string, unknown> = {},
  ): void {
    const now = new Date().toISOString();
    this.transaction(() => {
      this.servers.insert(server, now);
      this.audit.insert(
        "SERVER_ADDED",
        { id: server.id, name: server.name, target: `${server.host}:${server.port}`, ...auditDetails },
        now,
      );
    });
  }

  /** An edit of the address or password revokes the invites made for the server, they carry a copy of both. */
  updateServer(
    server: Pick<PersistedServer, "id" | "name" | "host" | "port" | "passwordEncrypted">,
    connectionChanged: boolean,
    auditDetails: Record<string, unknown> = {},
  ): void {
    const now = new Date().toISOString();
    let revoked = 0;
    this.transaction(() => {
      this.servers.update(server, now, connectionChanged);
      if (connectionChanged) revoked = this.managedInvites.revokeForServer(server.id);
      this.audit.insert(
        "SERVER_UPDATED",
        { id: server.id, name: server.name, target: `${server.host}:${server.port}`, revokedInvites: revoked, ...auditDetails },
        now,
      );
    });
  }

  reorderServers(ids: string[], auditDetails: Record<string, unknown> = {}): void {
    const now = new Date().toISOString();
    this.transaction(() => {
      this.servers.reorder(ids);
      this.audit.insert("SERVERS_REORDERED", { count: ids.length, ...auditDetails }, now);
    });
  }

  removeServer(id: string, auditDetails: Record<string, unknown> = {}): boolean {
    const now = new Date().toISOString();
    let removed = false;
    const name = this.servers.get(id)?.name;
    this.transaction(() => {
      removed = this.servers.delete(id);
      if (!removed) return;
      const revoked = this.managedInvites.revokeForServer(id);
      this.audit.insert("SERVER_REMOVED", { id, name, revokedInvites: revoked, ...auditDetails }, now);
    });
    return removed;
  }

  /** Keeps the result on the server. Only a change of availability is written to the event log, not every test. */
  recordConnectionTest(
    id: string,
    result: { latencyMs: number | null; error: string | null },
    details: Record<string, unknown> = {},
  ): void {
    const server = this.servers.get(id);
    if (!server) return;
    const wasUnavailable = server.lastTestAt !== null && server.lastTestError !== null;
    this.transaction(() => {
      this.servers.recordTest(id, result);
      const base = { id, name: server.name, ...details };
      if (result.error && !wasUnavailable) {
        this.audit.insert("SERVER_UNAVAILABLE", { ...base, code: result.error }, new Date().toISOString());
      } else if (!result.error && wasUnavailable) {
        this.audit.insert("SERVER_AVAILABLE", { ...base, latencyMs: result.latencyMs }, new Date().toISOString());
      }
    });
  }

  createManagedInvite(record: Omit<ManagedInviteRecord, "createdAt" | "revokedAt" | "useCount">): ManagedInviteRecord {
    return this.managedInvites.create(record);
  }

  listManagedInvites(options?: ManagedInviteListOptions): ManagedInviteRecord[] {
    return this.managedInvites.list(options);
  }

  countManagedInvites(status?: ManagedInviteStatus): number {
    return this.managedInvites.count(status);
  }

  /** Removes invites that stopped working more than `olderThanMs` ago. */
  pruneManagedInvites(olderThanMs: number): number {
    return this.managedInvites.prune(Date.now() - olderThanMs);
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

  /** The event log and the connection records only grow, so they are trimmed to the retention of the settings. */
  pruneByRetention(now = Date.now()): { events: number; connections: number } {
    const { eventLog, connections } = this.settings.get().retention;
    const cutoff = (days: number) => new Date(now - days * 86_400_000).toISOString();
    return {
      events: this.audit.prune(eventLog.maxRows, cutoff(eventLog.days)),
      connections: this.connections.prune(connections.maxRows, cutoff(connections.days)),
    };
  }

  beginConnection(start: ConnectionStart): void {
    this.connections.begin(start, new Date().toISOString());
  }

  markConnectionConnected(id: string): void {
    this.connections.markConnected(id, new Date().toISOString());
  }

  finishConnection(id: string, result: ConnectionFinish): ConnectionRecord | null {
    return this.connections.finish(id, result, new Date().toISOString());
  }

  getConnection(id: string): ConnectionRecord | null {
    return this.connections.get(id);
  }

  listConnections(query: ConnectionQuery): { records: ConnectionRecord[]; total: number } {
    return this.connections.list(query);
  }

  recentConnections(limit: number): ConnectionRecord[] {
    return this.connections.recent(limit);
  }

  closeOpenConnections(): number {
    return this.connections.closeOpen(new Date().toISOString());
  }

  listAudit(query: AuditQuery): { events: AuditEntry[]; total: number } {
    return this.audit.list(query);
  }

  private migrate(existed: boolean): void {
    const version = this.schemaVersion;
    if (version > DATABASE_SCHEMA_VERSION) {
      throw new Error(`Database schema ${version} is newer than this WebSpeak build`);
    }
    if (version > 0 && version < MINIMUM_SCHEMA_VERSION) {
      throw new Error(
        `Database schema ${version} is older than the oldest this WebSpeak build upgrades (${MINIMUM_SCHEMA_VERSION}). Start it once with WebSpeak 0.7.0 to upgrade it first.`,
      );
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

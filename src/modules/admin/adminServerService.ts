import { randomBytes } from "node:crypto";
import type { Logger } from "../../shared/logger.js";
import { formatTeamSpeakTarget, parseTeamSpeakTarget, type TeamSpeakTarget } from "../../shared/teamSpeakTarget.js";
import type { PersistedServer, WebSpeakDatabase } from "../../infra/persistence/database.js";
import { decryptSecret, encryptSecret } from "../../infra/security/secretCrypto.js";
import { AdminInputError } from "./adminErrors.js";
import { type AuditChange, diffFields } from "./auditChanges.js";

/** More than this is a dropdown nobody can use. */
export const SERVER_LIMIT = 32;

export interface ServerInput {
  name: string;
  target: string;
  serverPassword?: string;
  passwordAction?: "keep" | "replace" | "remove";
}

export interface ServerView {
  id: string;
  name: string;
  target: string;
  hasPassword: boolean;
  lastTestAt: string | null;
  lastTestLatencyMs: number | null;
  lastTestError: string | null;
}

export interface ResolvedServer {
  id: string;
  name: string;
  target: TeamSpeakTarget;
  serverPassword: string;
}

export class AdminServerService {
  constructor(
    private readonly database: WebSpeakDatabase,
    private readonly masterSecret: Buffer,
    private readonly logger: Logger,
  ) {}

  list(): ServerView[] {
    return this.database.listServers().map(toServerView);
  }

  create(input: ServerInput, ip?: string): ServerView {
    const servers = this.database.listServers();
    if (servers.length >= SERVER_LIMIT) throw new AdminInputError("SERVER_LIMIT", `At most ${SERVER_LIMIT} servers may be configured`);
    const { name, target } = this.readInput(input, servers);
    const record = {
      id: `server-${randomBytes(8).toString("hex")}`,
      name,
      host: target.host,
      port: target.port,
      passwordEncrypted: input.serverPassword ? encryptSecret(input.serverPassword, this.masterSecret) : null,
    };
    this.database.addServer(record, { ip });
    return toServerView(this.require(record.id));
  }

  update(id: string, input: ServerInput, ip?: string): ServerView {
    const servers = this.database.listServers();
    const current = servers.find((server) => server.id === id);
    if (!current) throw new AdminInputError("SERVER_NOT_FOUND", "Server not found");
    const { name, target } = this.readInput(input, servers, id);
    const action = input.passwordAction ?? (input.serverPassword === undefined ? "keep" : "replace");
    let passwordEncrypted = current.passwordEncrypted;
    if (action === "remove") passwordEncrypted = null;
    if (action === "replace") passwordEncrypted = input.serverPassword ? encryptSecret(input.serverPassword, this.masterSecret) : null;
    const connectionChanged = current.host !== target.host || current.port !== target.port || action !== "keep";
    const changes: AuditChange[] = diffFields(
      { name: current.name, target: `${current.host}:${current.port}` },
      { name, target: `${target.host}:${target.port}` },
    );
    if (action !== "keep") changes.push({ field: "password" });
    this.database.updateServer({ id, name, host: target.host, port: target.port, passwordEncrypted }, connectionChanged, { changes, ip });
    return toServerView(this.require(id));
  }

  /** `ids` must name every server exactly once, a partial list would leave the others at stale positions. */
  reorder(ids: unknown, ip?: string): void {
    const current = this.database.listServers().map((server) => server.id);
    if (
      !Array.isArray(ids) ||
      ids.length !== current.length ||
      new Set(ids).size !== ids.length ||
      !ids.every((id) => current.includes(id))
    ) {
      throw new AdminInputError("INVALID_SERVER_ORDER", "The order must list every server exactly once");
    }
    this.database.reorderServers(ids as string[], { ip });
  }

  remove(id: string, accessMode: string, ip?: string): void {
    const servers = this.database.listServers();
    if (!servers.some((server) => server.id === id)) throw new AdminInputError("SERVER_NOT_FOUND", "Server not found");
    if (accessMode === "fixed" && servers.length === 1) {
      throw new AdminInputError("SERVERS_REQUIRED", "The last server can only be removed in open access mode");
    }
    this.database.removeServer(id, { ip });
  }

  /** The server for a visitor's join, with its password decrypted. */
  resolve(id: string): ResolvedServer | null {
    const server = this.database.getServer(id);
    if (!server) return null;
    let serverPassword = "";
    try {
      serverPassword = decryptSecret(server.passwordEncrypted, this.masterSecret);
    } catch (error: unknown) {
      this.logger.error(
        { err: error instanceof Error ? error.message : String(error), serverId: id },
        "Stored TeamSpeak password could not be decrypted",
      );
    }
    return { id: server.id, name: server.name, target: { host: server.host, port: server.port }, serverPassword };
  }

  target(id: string): TeamSpeakTarget {
    const server = this.require(id);
    return { host: server.host, port: server.port };
  }

  private require(id: string): PersistedServer {
    const server = this.database.getServer(id);
    if (!server) throw new AdminInputError("SERVER_NOT_FOUND", "Server not found");
    return server;
  }

  private readInput(input: ServerInput, existing: PersistedServer[], ownId?: string): { name: string; target: TeamSpeakTarget } {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name || name.length > 80) throw new AdminInputError("INVALID_SERVER_NAME", "Server name must contain 1 to 80 characters");
    if (existing.some((server) => server.id !== ownId && server.name.toLowerCase() === name.toLowerCase())) {
      throw new AdminInputError("SERVER_NAME_TAKEN", "Another server already uses this name");
    }
    try {
      return { name, target: parseTeamSpeakTarget(input.target) };
    } catch {
      throw new AdminInputError("INVALID_TARGET", "TeamSpeak target is invalid");
    }
  }
}

export function toServerView(server: PersistedServer): ServerView {
  return {
    id: server.id,
    name: server.name,
    target: formatTeamSpeakTarget({ host: server.host, port: server.port }),
    hasPassword: Boolean(server.passwordEncrypted),
    lastTestAt: server.lastTestAt,
    lastTestLatencyMs: server.lastTestLatencyMs,
    lastTestError: server.lastTestError,
  };
}

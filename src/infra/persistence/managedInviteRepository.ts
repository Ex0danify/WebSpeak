import { mapManagedInviteRow, type ManagedInviteRow } from "./databaseRows.js";
import type { ManagedInviteRecord } from "./databaseTypes.js";
import type { PersistenceContext } from "./persistenceContext.js";

export type ManagedInviteStatus = "active" | "expired" | "exhausted" | "revoked";

export interface ManagedInviteListOptions {
  limit?: number;
  offset?: number;
  status?: ManagedInviteStatus;
  now?: number;
}

// The same precedence as the status the console shows: revoked, then expired, then used up.
function statusFilter(status: ManagedInviteStatus | undefined, now: number): { clause: string; params: string[] } {
  const nowIso = new Date(now).toISOString();
  switch (status) {
    case "revoked":
      return { clause: "WHERE revoked_at IS NOT NULL", params: [] };
    case "expired":
      return { clause: "WHERE revoked_at IS NULL AND expires_at <= ?", params: [nowIso] };
    case "exhausted":
      return { clause: "WHERE revoked_at IS NULL AND expires_at > ? AND max_uses > 0 AND use_count >= max_uses", params: [nowIso] };
    case "active":
      return { clause: "WHERE revoked_at IS NULL AND expires_at > ? AND (max_uses = 0 OR use_count < max_uses)", params: [nowIso] };
    default:
      return { clause: "", params: [] };
  }
}

export class ManagedInviteRepository {
  constructor(private readonly context: PersistenceContext) {}

  create(record: Omit<ManagedInviteRecord, "createdAt" | "revokedAt" | "useCount">): ManagedInviteRecord {
    const now = new Date().toISOString();
    this.context.transaction(() => {
      this.context.database
        .prepare(
          `INSERT INTO managed_invites (
           id, server_id, token_hash, target_host, target_port, server_password_encrypted,
           channel, expires_at, max_uses, use_count, created_at, revoked_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL)`,
        )
        .run(
          record.id,
          record.serverId,
          record.tokenHash,
          record.targetHost,
          record.targetPort,
          record.serverPasswordEncrypted,
          record.channel,
          record.expiresAt,
          record.maxUses,
          now,
        );
    });
    return { ...record, useCount: 0, createdAt: now, revokedAt: null };
  }

  /** Newest first. Without a `limit` it returns everything that matches. */
  list(options: ManagedInviteListOptions = {}): ManagedInviteRecord[] {
    const { clause, params } = statusFilter(options.status, options.now ?? Date.now());
    const rows = this.context.database
      .prepare(`SELECT * FROM managed_invites ${clause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
      .all(...params, options.limit ?? -1, options.offset ?? 0) as ManagedInviteRow[];
    return rows.map(mapManagedInviteRow);
  }

  count(status?: ManagedInviteStatus, now = Date.now()): number {
    const { clause, params } = statusFilter(status, now);
    const row = this.context.database.prepare(`SELECT COUNT(*) AS total FROM managed_invites ${clause}`).get(...params) as {
      total: number | bigint;
    };
    return Number(row.total);
  }

  /** Deletes the invites that were revoked or ran out of time before `cutoff` (epoch ms) and returns how many went. */
  prune(cutoff: number): number {
    const iso = new Date(cutoff).toISOString();
    const result = this.context.database
      .prepare("DELETE FROM managed_invites WHERE (revoked_at IS NOT NULL AND revoked_at < ?) OR (revoked_at IS NULL AND expires_at < ?)")
      .run(iso, iso);
    return Number(result.changes);
  }

  revoke(id: string): boolean {
    const result = this.context.database
      .prepare("UPDATE managed_invites SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
      .run(new Date().toISOString(), id) as { changes?: number | bigint };
    return Number(result.changes ?? 0) === 1;
  }

  revokeForServer(serverId: string): number {
    const result = this.context.database
      .prepare("UPDATE managed_invites SET revoked_at = ? WHERE server_id = ? AND revoked_at IS NULL")
      .run(new Date().toISOString(), serverId) as { changes?: number | bigint };
    return Number(result.changes ?? 0);
  }

  consume(tokenHash: string, now = Date.now()): ManagedInviteRecord | null {
    const nowIso = new Date(now).toISOString();
    this.context.database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.context.database
        .prepare(
          `SELECT * FROM managed_invites
         WHERE token_hash = ?
           AND revoked_at IS NULL
           AND expires_at > ?
           AND (max_uses = 0 OR use_count < max_uses)`,
        )
        .get(tokenHash, nowIso) as ManagedInviteRow | undefined;
      if (!row) {
        this.context.database.exec("COMMIT");
        return null;
      }
      const result = this.context.database
        .prepare(
          `UPDATE managed_invites
         SET use_count = use_count + 1
         WHERE id = ? AND revoked_at IS NULL AND expires_at > ?
           AND (max_uses = 0 OR use_count < max_uses)`,
        )
        .run(row.id, nowIso) as { changes?: number | bigint };
      if (Number(result.changes ?? 0) !== 1) {
        this.context.database.exec("COMMIT");
        return null;
      }
      this.context.database.exec("COMMIT");
      return { ...mapManagedInviteRow(row), useCount: row.use_count + 1 };
    } catch (error) {
      this.context.database.exec("ROLLBACK");
      throw error;
    }
  }
}

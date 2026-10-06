import { mapManagedInviteRow, type ManagedInviteRow } from "./databaseRows.js";
import type { ManagedInviteRecord } from "./databaseTypes.js";
import type { PersistenceContext } from "./persistenceContext.js";

export class ManagedInviteRepository {
  constructor(private readonly context: PersistenceContext) {}

  create(record: Omit<ManagedInviteRecord, "createdAt" | "revokedAt" | "useCount">): ManagedInviteRecord {
    const now = new Date().toISOString();
    this.context.transaction(() => {
      this.context.database.prepare(
        `INSERT INTO managed_invites (
           id, token_hash, target_host, target_port, server_password_encrypted,
           channel, expires_at, max_uses, use_count, created_at, revoked_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL)`,
      ).run(
        record.id,
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

  list(): ManagedInviteRecord[] {
    const rows = this.context.database.prepare(
      "SELECT * FROM managed_invites ORDER BY created_at DESC",
    ).all() as ManagedInviteRow[];
    return rows.map(mapManagedInviteRow);
  }

  revoke(id: string): boolean {
    const result = this.context.database.prepare(
      "UPDATE managed_invites SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
    ).run(new Date().toISOString(), id) as { changes?: number | bigint };
    return Number(result.changes ?? 0) === 1;
  }

  consume(tokenHash: string, now = Date.now()): ManagedInviteRecord | null {
    const nowIso = new Date(now).toISOString();
    this.context.database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.context.database.prepare(
        `SELECT * FROM managed_invites
         WHERE token_hash = ?
           AND revoked_at IS NULL
           AND expires_at > ?
           AND (max_uses = 0 OR use_count < max_uses)`,
      ).get(tokenHash, nowIso) as ManagedInviteRow | undefined;
      if (!row) {
        this.context.database.exec("COMMIT");
        return null;
      }
      const result = this.context.database.prepare(
        `UPDATE managed_invites
         SET use_count = use_count + 1
         WHERE id = ? AND revoked_at IS NULL AND expires_at > ?
           AND (max_uses = 0 OR use_count < max_uses)`,
      ).run(row.id, nowIso) as { changes?: number | bigint };
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

import type { PersistenceContext } from "./persistenceContext.js";

export class AuditRepository {
  constructor(private readonly context: PersistenceContext) {}

  insert(event: string, details: Record<string, unknown>, now: string): void {
    this.context.database
      .prepare("INSERT INTO audit_events (event, details_json, created_at) VALUES (?, ?, ?)")
      .run(event, JSON.stringify(details), now);
  }

  recent(limit = 8): Array<{ event: string; createdAt: string }> {
    const normalizedLimit = Math.max(1, Math.min(50, Math.floor(limit)));
    const rows = this.context.database
      .prepare("SELECT event, created_at FROM audit_events ORDER BY id DESC LIMIT ?")
      .all(normalizedLimit) as Array<{ event: string; created_at: string }>;
    return rows.map((row) => ({ event: row.event, createdAt: row.created_at }));
  }
}

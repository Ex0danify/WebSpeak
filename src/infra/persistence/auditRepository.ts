import { auditEventKind, type AuditCategory, type AuditSeverity } from "./auditEvents.js";
import type { PersistenceContext } from "./persistenceContext.js";

export interface AuditEntry {
  id: number;
  event: string;
  category: AuditCategory;
  severity: AuditSeverity;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface AuditQuery {
  limit: number;
  offset: number;
  categories?: readonly AuditCategory[];
  /** Only rows of these severities, an empty list matches nothing. */
  severities?: AuditSeverity[];
  /** Matches the event name and the details. */
  search?: string;
  /** ISO time, only rows from then on. */
  since?: string;
}

interface AuditRow {
  id: number;
  event: string;
  category: AuditCategory;
  severity: AuditSeverity;
  details_json: string;
  created_at: string;
}

const MAX_PAGE = 100;

export class AuditRepository {
  constructor(private readonly context: PersistenceContext) {}

  insert(event: string, details: Record<string, unknown>, now: string): void {
    const { category, severity } = auditEventKind(event);
    this.context.database
      .prepare("INSERT INTO audit_events (event, category, severity, details_json, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(event, category, severity, JSON.stringify(details), now);
  }

  /** One page of the newest rows that match, with how many match in all. */
  list(query: AuditQuery): { events: AuditEntry[]; total: number } {
    const { where, params } = buildFilter(query);
    const limit = Math.max(1, Math.min(MAX_PAGE, Math.floor(query.limit)));
    const offset = Math.max(0, Math.floor(query.offset));
    const rows = this.context.database
      .prepare(`SELECT id, event, category, severity, details_json, created_at FROM audit_events${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as unknown as AuditRow[];
    const counted = this.context.database.prepare(`SELECT COUNT(*) AS total FROM audit_events${where}`).get(...params) as { total: number };
    return { events: rows.map(mapAuditRow), total: Number(counted.total) };
  }

  /** Deletes the rows older than the cutoff and all but the newest `keep`, and returns how many went. */
  prune(keep: number, olderThan: string): number {
    const result = this.context.database
      .prepare("DELETE FROM audit_events WHERE created_at < ? OR id NOT IN (SELECT id FROM audit_events ORDER BY id DESC LIMIT ?)")
      .run(olderThan, Math.max(0, Math.floor(keep)));
    return Number(result.changes);
  }
}

function buildFilter(query: AuditQuery): { where: string; params: string[] } {
  const clauses: string[] = [];
  const params: string[] = [];
  if (query.categories) {
    // No category at all is an empty list, which matches nothing.
    clauses.push(`category IN (${query.categories.map(() => "?").join(", ") || "NULL"})`);
    params.push(...query.categories);
  }
  if (query.severities) {
    clauses.push(`severity IN (${query.severities.map(() => "?").join(", ") || "NULL"})`);
    params.push(...query.severities);
  }
  if (query.since) {
    clauses.push("created_at >= ?");
    params.push(query.since);
  }
  const term = query.search?.trim().toLowerCase();
  if (term) {
    // Spaces match the underscores of an event name, so "login failed" finds ADMIN_LOGIN_FAILED.
    const escape = (text: string) => text.replace(/[\\%_]/g, "\\$&");
    clauses.push("(lower(event) LIKE ? ESCAPE '\\' OR lower(details_json) LIKE ? ESCAPE '\\')");
    params.push(`%${escape(term.replaceAll(" ", "_"))}%`, `%${escape(term)}%`);
  }
  return { where: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "", params };
}

function mapAuditRow(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    event: row.event,
    category: row.category,
    severity: row.severity,
    details: parseDetails(row.details_json),
    createdAt: row.created_at,
  };
}

function parseDetails(json: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(json);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

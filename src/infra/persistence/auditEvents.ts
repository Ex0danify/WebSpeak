export const AUDIT_CATEGORIES = ["auth", "config", "invites", "availability", "sessions", "system"] as const;
export const AUDIT_SEVERITIES = ["info", "warning", "error"] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];

interface AuditEventKind {
  category: AuditCategory;
  severity: AuditSeverity;
}

const KINDS: Record<string, AuditEventKind> = {
  ADMIN_LOGIN_SUCCEEDED: { category: "auth", severity: "info" },
  ADMIN_LOGIN_FAILED: { category: "auth", severity: "warning" },
  ADMIN_LOGOUT: { category: "auth", severity: "info" },
  ADMIN_PASSWORD_CHANGED: { category: "auth", severity: "info" },
  ADMIN_PASSWORD_RESET: { category: "auth", severity: "warning" },
  ADMIN_SESSION_TERMINATED: { category: "auth", severity: "info" },
  SETTINGS_CHANGED: { category: "config", severity: "info" },
  SERVER_ADDED: { category: "config", severity: "info" },
  SERVER_UPDATED: { category: "config", severity: "info" },
  SERVER_REMOVED: { category: "config", severity: "info" },
  SERVERS_REORDERED: { category: "config", severity: "info" },
  INVITE_CREATED: { category: "invites", severity: "info" },
  INVITE_CONSUMED: { category: "invites", severity: "info" },
  INVITE_REVOKED: { category: "invites", severity: "info" },
  SERVER_AVAILABLE: { category: "availability", severity: "info" },
  SERVER_UNAVAILABLE: { category: "availability", severity: "error" },
  SESSION_CONNECTED: { category: "sessions", severity: "info" },
  SESSION_CONNECT_FAILED: { category: "sessions", severity: "warning" },
  SESSION_ENDED: { category: "sessions", severity: "info" },
  GATEWAY_STARTED: { category: "system", severity: "info" },
  GATEWAY_STOPPED: { category: "system", severity: "info" },
  GATEWAY_ERROR: { category: "system", severity: "error" },
  CAPACITY_REACHED: { category: "system", severity: "warning" },
  ADMIN_INITIALIZED: { category: "system", severity: "info" },
  ADMIN_BACKUP_EXPORTED: { category: "system", severity: "info" },
};

const FALLBACK: AuditEventKind = { category: "system", severity: "info" };

/** What a new row of this event is filed under. Both are stored with the row, so a later change here leaves old rows alone. */
export function auditEventKind(event: string): AuditEventKind {
  return KINDS[event] ?? FALLBACK;
}

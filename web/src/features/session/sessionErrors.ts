import type { MessageKey } from "@/shared/i18n/messageKeys";

const MAX_VISIBLE_ERROR_CODE_LENGTH = 64;
const CLIENT_ERROR_CODE_ALIASES: Record<string, string> = {
  PASSWORD_REQUIRED: "SERVER_PASSWORD_REQUIRED",
  INVALID_PASSWORD: "INVALID_SERVER_PASSWORD",
  AUTHENTICATION_FAILED: "INVALID_SERVER_PASSWORD",
  GATEWAY_FULL: "SERVER_REJECTED",
  TS_CONNECT_FAILED: "CONNECTION_FAILED",
  TEAM_SPEAK_CONNECT_FAILED: "CONNECTION_FAILED",
  "ADMIN-TERMINATED": "ADMIN_TERMINATED",
};

/** Keep codes useful to the user without allowing an unbounded server value into the UI. */
export function safeClientErrorCode(value: unknown): string {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized.slice(0, MAX_VISIBLE_ERROR_CODE_LENGTH);
}

/** The code shown next to a connection error; never empty. */
export function visibleErrorCode(value: unknown): string {
  return safeClientErrorCode(value) || "CONNECTION_FAILED";
}

export function normalizedClientErrorCode(value: unknown, fallback = "CONNECTION_FAILED"): string {
  const safe = safeClientErrorCode(value);
  return CLIENT_ERROR_CODE_ALIASES[safe] ?? (safe || fallback);
}

export function safeClientErrorDetail(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

/**
 * TeamSpeak has no dedicated error for a nickname it refuses: a nickname outside
 * its length rules is answered with "invalid parameter size" and server error id
 * 1541. That signature is the only machine-readable hint the gateway can forward,
 * so keep the matcher next to the message builder that explains it to the user.
 */
export const NICKNAME_LENGTH_SIGNATURE = /invalid[\s_-]*parameter[\s_-]*size|\bid[\s=:]*1541\b|nickname.{0,30}(?:length|size)/i;

/**
 * Every code this client can explain for a failed connection; each has an `err_<CODE>` key. A code is
 * regarded as "explainable" only when it appears here, which is also what keeps the gateway close
 * codes from being replaced by an unknown close reason.
 */
export const CONNECTION_FAILURE_CODES: ReadonlySet<string> = new Set([
  "ORIGIN_REJECTED", "NOT_INITIALIZED", "RATE_LIMITED", "INVALID_TARGET", "INVALID_NICKNAME", "HOST_NOT_FOUND", "UNREACHABLE",
  "CONNECTION_REFUSED", "CONNECTION_RESET", "TIMEOUT", "SERVER_PASSWORD_REQUIRED", "INVALID_SERVER_PASSWORD",
  "PROTOCOL_NEGOTIATION_FAILED", "SERVER_REJECTED", "CHANNEL_PASSWORD_REQUIRED", "NICKNAME_IN_USE",
  "IDENTITY_SECURITY_LEVEL_TOO_LOW", "IDENTITY_LIMIT_REACHED", "CLIENT_VERSION_OUTDATED", "FLOOD_PROTECTION", "BANNED", "KICKED",
  "SERVER_SHUTTING_DOWN", "CONNECTION_INITIALISATION_FAILED", "SERVER_FULL", "INVALID_PARAMETER", "IDENTITY_IN_USE", "CONNECTION_FAILED",
  // Gateway close codes: these replace the generic "connection failed" when the gateway drops the
  // socket itself (see GATEWAY_CLOSE_CODE_CODES).
  "JOIN_TICKET_REQUIRED", "IDENTITY_INVALID", "IDENTITY_REJECTED", "ACCELERATION_UNAVAILABLE", "GATEWAY_NETWORK_LOST",
  "GATEWAY_SESSION_ENDED", "GATEWAY_RESTARTING", "ADMIN_TERMINATED", "TEAM_SPEAK_CLIENT_UNAVAILABLE",
]);

/** `err_<CODE>` key of a wire code. The key set is pinned by the code-completeness test. */
export function errorKey(code: string, prefix: "err" | "opErr" | "joinErr" = "err"): MessageKey {
  // Wire codes are open strings; the code-completeness test pins that every code has its key.
  return `${prefix}_${code}` as MessageKey;
}

import { collectDiagnostics, diagnosticText, type TeamSpeakErrorDiagnostics } from "./errorDiagnostics.js";

export type WebSpeakErrorCode =
  | "invalid_target"
  | "invalid_nickname"
  | "nickname_in_use"
  | "host_not_found"
  | "unreachable"
  | "connection_refused"
  | "connection_reset"
  | "timeout"
  | "authentication_failed"
  | "channel_password_required"
  | "identity_security_level_too_low"
  | "identity_limit_reached"
  | "client_version_outdated"
  | "flooding"
  | "banned"
  | "kicked"
  | "server_shutting_down"
  | "server_full"
  | "invalid_parameter_size"
  | "connection_initialisation_failed"
  | "protocol_negotiation_failed"
  | "unknown";

/** Every code clientConnectionFailureCode can return, so tests and the web check can list them. */
export const CLIENT_CONNECTION_FAILURE_CODES = [
  "INVALID_TARGET",
  "INVALID_NICKNAME",
  "NICKNAME_IN_USE",
  "HOST_NOT_FOUND",
  "UNREACHABLE",
  "CONNECTION_REFUSED",
  "CONNECTION_RESET",
  "TIMEOUT",
  "SERVER_PASSWORD_REQUIRED",
  "INVALID_SERVER_PASSWORD",
  "CHANNEL_PASSWORD_REQUIRED",
  "IDENTITY_SECURITY_LEVEL_TOO_LOW",
  "IDENTITY_LIMIT_REACHED",
  "CLIENT_VERSION_OUTDATED",
  "FLOOD_PROTECTION",
  "BANNED",
  "KICKED",
  "SERVER_SHUTTING_DOWN",
  "SERVER_FULL",
  "PROTOCOL_NEGOTIATION_FAILED",
  "CONNECTION_INITIALISATION_FAILED",
  "CONNECTION_FAILED",
] as const;

export type ClientConnectionFailureCode = (typeof CLIENT_CONNECTION_FAILURE_CODES)[number];
/** connectionFailed codes the bridge sends before a TeamSpeak session exists, they skip clientConnectionFailureCode. */
export const BRIDGE_CONNECTION_FAILURE_CODES = ["IDENTITY_INVALID", "TEAM_SPEAK_CLIENT_UNAVAILABLE"] as const;

export class WebSpeakError extends Error {
  readonly code: WebSpeakErrorCode;
  readonly retryable: boolean;
  readonly cause?: unknown;
  readonly diagnostics: TeamSpeakErrorDiagnostics;

  constructor(code: WebSpeakErrorCode, message: string, retryable: boolean, cause?: unknown, diagnostics: TeamSpeakErrorDiagnostics = {}) {
    super(message);
    this.name = "WebSpeakError";
    this.code = code;
    this.retryable = retryable;
    this.cause = cause;
    this.diagnostics = diagnostics;
  }
}

/**
 * TeamSpeak server error ids (SDK public_errors.h, same for TS3 and TS6) we can name exactly.
 * Missing ids fall through to the text heuristics and end up as unknown with the raw detail.
 */
export const TEAMSPEAK_SERVER_ERROR_IDS: Readonly<Record<string, WebSpeakErrorCode>> = {
  "513": "nickname_in_use",
  "515": "server_full",
  "519": "identity_security_level_too_low",
  "520": "authentication_failed",
  "521": "identity_limit_reached",
  "522": "client_version_outdated",
  "524": "flooding",
  // 1541 is the generic invalid parameter size, the connect path decides if it means a nickname.
  "1536": "invalid_parameter_size",
  "1537": "invalid_parameter_size",
  "1538": "invalid_parameter_size",
  "1539": "invalid_parameter_size",
  "1540": "invalid_parameter_size",
  "1541": "invalid_parameter_size",
  "1542": "invalid_parameter_size",
  "1543": "protocol_negotiation_failed",
  // Only ids whose official meaning matches the code, other SDK operation errors must not get relabelled.
  "1797": "connection_initialisation_failed",
  "1798": "host_not_found",
  "1805": "protocol_negotiation_failed",
  "1806": "protocol_negotiation_failed",
  "1026": "server_shutting_down",
  "1027": "server_full",
  "1028": "authentication_failed",
  "781": "channel_password_required",
  // Slot limit and virtual server limit both look like a full server to the user.
  "2816": "server_full",
  "2817": "server_full",
  "3329": "banned",
  "3330": "banned",
  "3331": "flooding",
};

/** English message per code, for logs. The browser renders its own text from the code, raw server detail goes in diagnostics. */
export const WEBSPEAK_ERROR_MESSAGES: Readonly<Record<WebSpeakErrorCode, string>> = {
  invalid_target: "The TeamSpeak server address is invalid",
  invalid_nickname: "TeamSpeak refused the nickname: it must be 3-30 characters long",
  nickname_in_use: "This nickname is already used by another user on the TeamSpeak server",
  host_not_found: "TeamSpeak server hostname could not be resolved",
  unreachable: "TeamSpeak server is unreachable",
  connection_refused: "TeamSpeak server refused the connection",
  connection_reset: "TeamSpeak connection was reset",
  timeout: "TeamSpeak connection timed out",
  authentication_failed: "TeamSpeak authentication failed",
  channel_password_required: "The TeamSpeak channel requires a password",
  identity_security_level_too_low: "This TeamSpeak identity's security level is below the server requirement",
  identity_limit_reached: "This TeamSpeak identity already holds the maximum number of connections",
  client_version_outdated: "The TeamSpeak server requires a newer client version",
  flooding: "The TeamSpeak server's flood protection refused the connection",
  banned: "You are banned from this TeamSpeak server",
  kicked: "You were kicked from the TeamSpeak server",
  server_shutting_down: "The TeamSpeak server is shutting down",
  connection_initialisation_failed: "The TeamSpeak server refused the connection during initialisation",
  server_full: "The TeamSpeak server is full",
  invalid_parameter_size: "TeamSpeak refused a parameter because its length or value is out of range",
  protocol_negotiation_failed: "TeamSpeak protocol negotiation failed",
  unknown: "TeamSpeak connection failed",
};

/** Codes where reconnecting unchanged cannot work. unknown stays out so an unmapped refusal never becomes a reconnect loop. */
const NON_RETRYABLE_CODES: ReadonlySet<WebSpeakErrorCode> = new Set<WebSpeakErrorCode>([
  "invalid_target",
  "invalid_nickname",
  "nickname_in_use",
  "authentication_failed",
  "channel_password_required",
  "identity_security_level_too_low",
  "identity_limit_reached",
  "client_version_outdated",
  "banned",
  "kicked",
  "invalid_parameter_size",
  "connection_initialisation_failed",
  "unknown",
]);

function createTeamSpeakError(code: WebSpeakErrorCode, cause: unknown, diagnostics: TeamSpeakErrorDiagnostics): WebSpeakError {
  return new WebSpeakError(code, WEBSPEAK_ERROR_MESSAGES[code], !NON_RETRYABLE_CODES.has(code), cause, diagnostics);
}

/** Raw server error id to normalized code. Takes decimal (err.id, id=515) and hex (0x0203) because both show up in logs. */
export function teamSpeakServerErrorCode(id: unknown): WebSpeakErrorCode | null {
  if (id === undefined || id === null) return null;
  const text = String(id).trim().toLocaleLowerCase();
  if (/^\d{1,6}$/.test(text)) return TEAMSPEAK_SERVER_ERROR_IDS[String(Number(text))] ?? null;
  const hexMatch = /^(?:0x)?([0-9a-f]{4,6})$/.exec(text);
  if (hexMatch) return TEAMSPEAK_SERVER_ERROR_IDS[String(parseInt(hexMatch[1], 16))] ?? null;
  return null;
}

// Tries the server error id first, then keywords, the exception class name and transport traits.
export function normalizeTeamSpeakError(error: unknown): WebSpeakError {
  if (error instanceof WebSpeakError) return error;
  const diagnostics = collectDiagnostics(error);
  const text = diagnosticText(error).toLocaleLowerCase();

  // The server id names the exact reason so it beats every keyword heuristic.
  // The inline scan covers id=515 for when the SDK does not attach the id.
  const inlineId = /\bid[\s=:]*(\d{3,5})\b/.exec(text)?.[1];
  const serverErrorCode =
    teamSpeakServerErrorCode(diagnostics.id) ?? teamSpeakServerErrorCode(diagnostics.code) ?? teamSpeakServerErrorCode(inlineId);
  if (serverErrorCode) return createTeamSpeakError(serverErrorCode, error, diagnostics);

  // Refusals without a stable id. Keep the patterns narrow, words like password or denied
  // show up in unrelated messages and used to steal the classification.
  if (/nickname.{0,20}(length|size)/.test(text)) {
    return createTeamSpeakError("invalid_nickname", error, diagnostics);
  }
  if (/invalid[\s_-]*parameter[\s_-]*size|parameter.{0,20}(size|out of range)/.test(text)) {
    return createTeamSpeakError("invalid_parameter_size", error, diagnostics);
  }
  if (/nickname.{0,30}(in use|already (in )?use|taken|exists)|nickname_in_use/.test(text)) {
    return createTeamSpeakError("nickname_in_use", error, diagnostics);
  }
  if (/channel.{0,30}password|password.{0,30}channel|i_channel_password/.test(text)) {
    return createTeamSpeakError("channel_password_required", error, diagnostics);
  }
  if (/security ?level|insufficient security|could not validate identity/.test(text)) {
    return createTeamSpeakError("identity_security_level_too_low", error, diagnostics);
  }
  if (/too many clones|clone.{0,20}(limit|connected)|identity.{0,20}(limit|maximum|max).{0,20}connection/.test(text)) {
    return createTeamSpeakError("identity_limit_reached", error, diagnostics);
  }
  if (/version.{0,25}(outdated|out of date|too old|not allowed|unsupported)|outdated.{0,25}version/.test(text)) {
    return createTeamSpeakError("client_version_outdated", error, diagnostics);
  }
  if (/flood/.test(text)) {
    return createTeamSpeakError("flooding", error, diagnostics);
  }
  if (/\bban(ned)?\b|blacklist|you may retry in/.test(text)) {
    return createTeamSpeakError("banned", error, diagnostics);
  }
  if (/kicked/.test(text)) {
    return createTeamSpeakError("kicked", error, diagnostics);
  }
  if (/server.{0,20}shut ?down|server_shutdown|server is shutting down/.test(text)) {
    return createTeamSpeakError("server_shutting_down", error, diagnostics);
  }
  if (
    /failed[\s_-]*connection[\s_-]*initiali[sz]ation|connection initiali[sz]ation failed|failed to (initialise|initialize) the connection/.test(
      text,
    )
  ) {
    return createTeamSpeakError("connection_initialisation_failed", error, diagnostics);
  }
  if (/server.{0,25}full|server is full|maximum (number of )?(clients|slots)|slot limit|client protocol limit/.test(text)) {
    return createTeamSpeakError("server_full", error, diagnostics);
  }
  if (
    /invalid (server )?password|wrong (server )?password|password (is )?(invalid|incorrect|wrong)|password required|i_server_password|authentication failed|not authorized|invalid credential|login (failed|refused)/.test(
      text,
    )
  ) {
    return createTeamSpeakError("authentication_failed", error, diagnostics);
  }

  // Handshake and crypto errors have no numeric id, so match the class name before the text.
  const errorName = (diagnostics.name ?? "").toLocaleLowerCase();
  if (/eaxtagmismatch|fakesignaturemismatch|cryptoinit|invalididentity|license/.test(errorName)) {
    return createTeamSpeakError("protocol_negotiation_failed", error, diagnostics);
  }
  if (/alreadyconnected/.test(errorName)) {
    return createTeamSpeakError("identity_limit_reached", error, diagnostics);
  }
  if (/timeout/.test(errorName)) {
    return createTeamSpeakError("timeout", error, diagnostics);
  }

  if (/enotfound|eai_again|host not found|name or service not known|getaddrinfo/.test(text)) {
    return createTeamSpeakError("host_not_found", error, diagnostics);
  }
  if (/econnrefused|connection refused/.test(text)) {
    return createTeamSpeakError("connection_refused", error, diagnostics);
  }
  if (/econnreset|econnaborted|connection reset|connection aborted|socket hang up/.test(text)) {
    return createTeamSpeakError("connection_reset", error, diagnostics);
  }
  if (/timeout|timed out|ack timeout|idle timeout|etimedout/.test(text)) {
    return createTeamSpeakError("timeout", error, diagnostics);
  }
  if (/ehostunreach|enetunreach|network is unreachable|no route to host|unable to connect|transport error|unexpected eof/.test(text)) {
    return createTeamSpeakError("unreachable", error, diagnostics);
  }
  if (/handshake|protocol|eax|crypto ?(init|handshake|setup)|init1|signature|license/.test(text)) {
    return createTeamSpeakError("protocol_negotiation_failed", error, diagnostics);
  }
  return createTeamSpeakError("unknown", error, diagnostics);
}

export function clientConnectionFailureCode(error: WebSpeakError, serverPassword = ""): ClientConnectionFailureCode {
  if (error.code === "authentication_failed") {
    return serverPassword.trim() ? "INVALID_SERVER_PASSWORD" : "SERVER_PASSWORD_REQUIRED";
  }
  const mapping: Record<WebSpeakErrorCode, ClientConnectionFailureCode> = {
    invalid_target: "INVALID_TARGET",
    invalid_nickname: "INVALID_NICKNAME",
    nickname_in_use: "NICKNAME_IN_USE",
    host_not_found: "HOST_NOT_FOUND",
    unreachable: "UNREACHABLE",
    connection_refused: "CONNECTION_REFUSED",
    connection_reset: "CONNECTION_RESET",
    timeout: "TIMEOUT",
    authentication_failed: "SERVER_PASSWORD_REQUIRED",
    channel_password_required: "CHANNEL_PASSWORD_REQUIRED",
    identity_security_level_too_low: "IDENTITY_SECURITY_LEVEL_TOO_LOW",
    identity_limit_reached: "IDENTITY_LIMIT_REACHED",
    client_version_outdated: "CLIENT_VERSION_OUTDATED",
    flooding: "FLOOD_PROTECTION",
    banned: "BANNED",
    kicked: "KICKED",
    server_shutting_down: "SERVER_SHUTTING_DOWN",
    connection_initialisation_failed: "CONNECTION_INITIALISATION_FAILED",
    server_full: "SERVER_FULL",
    // During the connect handshake this id nearly always means a bad nickname, operation errors keep the generic message.
    invalid_parameter_size: "INVALID_NICKNAME",
    protocol_negotiation_failed: "PROTOCOL_NEGOTIATION_FAILED",
    unknown: "CONNECTION_FAILED",
  };
  return mapping[error.code];
}

/**
 * A kick or ban arrives as clientleftview with reason id 4 or 5 plus the admin's message.
 * The server text decides kick vs ban, reason id 5 is the fallback.
 */
export function normalizeTeamSpeakKickedReason(reasonMsg: unknown, reasonId?: unknown): WebSpeakError {
  const text = typeof reasonMsg === "string" ? reasonMsg.trim() : "";
  const hasReasonId = reasonId !== null && reasonId !== undefined && reasonId !== "";
  const numericReasonId = !hasReasonId ? Number.NaN : typeof reasonId === "number" ? reasonId : Number(reasonId);
  const isBan = /\bban(ned)?\b|blacklist|you may retry in/i.test(text) || numericReasonId === 5;
  const diagnostics: TeamSpeakErrorDiagnostics = { name: isBan ? "TeamSpeakBan" : "TeamSpeakKick" };
  if (text) diagnostics.serverMessage = text;
  if (Number.isFinite(numericReasonId)) diagnostics.id = String(numericReasonId);
  return createTeamSpeakError(isBan ? "banned" : "kicked", reasonMsg, diagnostics);
}

/** Compact error detail for log fields. */
export function describeTeamSpeakError(error: WebSpeakError): string {
  const details = error.diagnostics;
  const parts = [
    details.name,
    details.code,
    details.id ? `id=${details.id}` : "",
    details.serverMessage,
    details.syscall,
    details.address ? `address=${details.address}` : "",
    details.port !== undefined ? `port=${details.port}` : "",
    details.cause,
    details.message,
  ].filter(Boolean);
  return parts.length ? parts.join("; ") : error.message;
}

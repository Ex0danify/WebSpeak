import { text, type LocalizedText } from "@/shared/i18n/localizedText";
import {
  CONNECTION_FAILURE_CODES,
  NICKNAME_LENGTH_SIGNATURE,
  errorKey,
  normalizedClientErrorCode,
  safeClientErrorCode,
  safeClientErrorDetail,
} from "./sessionErrors";

/** Codes `/api/join-ticket` answers with. Each has its own text (`joinErr_<CODE>`) or falls through
 *  to the connection-failure text of the same code. */
export const JOIN_TICKET_CODES: ReadonlySet<string> = new Set([
  "TARGET_NOT_ALLOWED",
  "ACCELERATION_UNAVAILABLE",
  "INVALID_NICKNAME",
  "INVITE_INVALID",
]);

/** Codes a command refusal (`{ type: "error" }`) can carry. `opErr_<CODE>` where the wording differs
 *  from the same code on a failed connection (OPERATION_CODES_WITH_OWN_TEXT), `err_<CODE>` otherwise. */
export const OPERATION_ERROR_CODES: ReadonlySet<string> = new Set([
  "INVALID_JSON",
  "INVALID_MESSAGE",
  "INVALID_REQUEST_ID",
  "UNKNOWN_MESSAGE_TYPE",
  "INVALID_PAYLOAD",
  "INVALID_CHANNEL_ID",
  "INVALID_CHANNEL_PASSWORD",
  "INVALID_CLIENT_ID",
  "INVALID_TEXT_MESSAGE",
  "INVALID_POKE_MESSAGE",
  "INVALID_AWAY_STATUS",
  "INVALID_MICROPHONE_STATE",
  "INVALID_OUTPUT_STATE",
  "INVALID_ACCOMPANIMENT_STATE",
  "INVALID_LATENCY_PROBE",
  "INVALID_AUDIO_FRAME",
  "INVALID_MEMBER_VOLUME",
  "INVALID_WHISPER_TARGETS",
  "INVALID_WHISPER_STATE",
  "NO_WHISPER_TARGETS",
  "WEBRTC_DISABLED",
  "SESSION_NOT_READY",
  "CHANNEL_SWITCH_FAILED",
  "CHANNEL_PASSWORD_REQUIRED",
  "CHANNEL_FULL",
  "ALREADY_IN_CHANNEL",
  "CANNOT_MOVE_SELF",
  "CHANNEL_NOT_FOUND",
  "NICKNAME_IN_USE",
  "CLIENT_VERSION_OUTDATED",
  "FLOOD_PROTECTION",
  "BANNED",
  "KICKED",
  "PERMISSION_DENIED",
  "CLIENT_NOT_FOUND",
  "CONNECTION_INITIALISATION_FAILED",
  "OPERATION_FAILED",
]);
const OPERATION_CODES_WITH_OWN_TEXT: ReadonlySet<string> = new Set([
  "NICKNAME_IN_USE",
  "CLIENT_VERSION_OUTDATED",
  "FLOOD_PROTECTION",
  "BANNED",
]);

export function joinTicketReason(code: string, detail?: unknown): LocalizedText {
  const normalized = normalizedClientErrorCode(code);
  return JOIN_TICKET_CODES.has(normalized) ? text(errorKey(normalized, "joinErr")) : connectionFailureMessage(normalized, detail);
}

/**
 * Gateway close codes. 4000-4003 are gateway/session level, 4004 and 4005 a TeamSpeak rejection and an identity conflict, 4006
 * the acceleration relay, 1001 the gateway going down on purpose, 1006 a transport-level drop that must not be blamed on
 * TeamSpeak.
 */
export const GATEWAY_CLOSE_CODE_CODES: Record<number, string> = {
  4000: "CONNECTION_FAILED",
  4001: "JOIN_TICKET_REQUIRED",
  4002: "INVALID_TARGET",
  4003: "IDENTITY_REJECTED",
  4004: "SERVER_REJECTED",
  4005: "IDENTITY_IN_USE",
  4006: "ACCELERATION_UNAVAILABLE",
  1001: "GATEWAY_RESTARTING",
  1006: "GATEWAY_NETWORK_LOST",
  1011: "GATEWAY_SESSION_ENDED",
};

export function closeErrorCode(code: number, reason = ""): string {
  const closeCode = normalizedClientErrorCode(reason, "");
  // The gateway repeats the failure code in the close reason. Trust it when the browser can explain that code, otherwise
  // fall back to the numeric close code so even a silent close maps to an actionable message.
  if (closeCode && CONNECTION_FAILURE_CODES.has(closeCode)) return closeCode;
  return GATEWAY_CLOSE_CODE_CODES[code] ?? "CONNECTION_FAILED";
}

export function connectionFailureMessage(code: string, detail?: unknown): LocalizedText {
  const normalized = normalizedClientErrorCode(code);
  if (CONNECTION_FAILURE_CODES.has(normalized)) return text(errorKey(normalized));
  const safeCode = safeClientErrorCode(normalized);
  const safeDetail = safeClientErrorDetail(detail);
  // The gateway classifies a refused nickname before it reaches the browser, but explain the raw TeamSpeak signature too so a
  // nickname problem never ends up as the generic "check your network" fallback.
  if (safeDetail && NICKNAME_LENGTH_SIGNATURE.test(safeDetail)) return text(errorKey("INVALID_NICKNAME"));
  return safeDetail
    ? text("connectionFailedUnknownDetail", { code: safeCode, detail: safeDetail })
    : text("connectionFailedUnknown", { code: safeCode });
}

export function closeReason(code: number, reason = ""): LocalizedText {
  const failureCode = closeErrorCode(code, reason);
  if (code === 4004 && failureCode === "SERVER_REJECTED") return text("closeServerFullOrRejected");
  return connectionFailureMessage(failureCode);
}

export function protocolErrorMessage(code: string, fallback: string): LocalizedText {
  const normalized = normalizedClientErrorCode(code, "OPERATION_FAILED");
  if (OPERATION_ERROR_CODES.has(normalized)) {
    return text(errorKey(normalized, OPERATION_CODES_WITH_OWN_TEXT.has(normalized) ? "opErr" : "err"));
  }
  const safeCode = safeClientErrorCode(normalized);
  const safeFallback = safeClientErrorDetail(fallback);
  return safeFallback
    ? text("operationFailedUnknownDetail", { code: safeCode, detail: safeFallback })
    : text("operationFailedUnknown", { code: safeCode });
}

import { normalizeTeamSpeakError, teamSpeakServerErrorCode } from "../../../shared/errors.js";
import type { MessageCode, MessageParams } from "../../../shared/messageCodes.js";
import { isRecord } from "../../../shared/typeGuards.js";

export function publicFailureDetail(error: ReturnType<typeof normalizeTeamSpeakError>): string | undefined {
  const serverMessage = error.diagnostics.serverMessage?.trim();
  const serverId = error.diagnostics.id?.trim();
  const detail = [serverMessage, serverId ? `server error id=${serverId}` : ""].filter(Boolean).join("; ");
  const safe = detail.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
  return safe || undefined;
}

export function classifyOperationError(error: unknown, fallbackCode: MessageCode, fallbackMessage: string): { code: MessageCode; message: string } {
  const text = error instanceof Error ? error.message : String(error);
  const normalized = text.toLocaleLowerCase();
  // A TeamSpeak server error id is authoritative when the SDK preserved it, so it
  // is consulted before the keyword rules: 781 (channel password), 2568
  // (permissions), 515/2817 (server or slot limit) and friends keep their exact
  // meaning instead of being guessed from prose.
  const serverCode =
    teamSpeakServerErrorCode(isRecord(error) ? (error.id ?? error.code) : undefined) ??
    teamSpeakServerErrorCode(/\bid[\s=:]*(\d{3,5})\b/.exec(normalized)?.[1]);
  if (serverCode) {
    if (serverCode === "identity_security_level_too_low") return { code: "PERMISSION_DENIED", message: "You do not have permission to do this" };
    if (serverCode === "channel_password_required") return { code: "CHANNEL_PASSWORD_REQUIRED", message: "This channel requires a password" };
    if (serverCode === "server_full") return { code: "CHANNEL_FULL", message: "This channel is full" };
    if (serverCode === "client_version_outdated") return { code: "CLIENT_VERSION_OUTDATED", message: "Client version is too old, the server rejected the operation" };
    if (serverCode === "flooding") return { code: "FLOOD_PROTECTION", message: "Too many requests, try again later" };
    if (serverCode === "banned") return { code: "BANNED", message: "You are banned from this server" };
    if (serverCode === "connection_initialisation_failed") return { code: "CONNECTION_INITIALISATION_FAILED", message: "TeamSpeak server could not finish connection initialisation, try again later" };
  }
  if (/permission|not permitted|insufficient|i_permission|2568/.test(normalized)) return { code: "PERMISSION_DENIED", message: "You do not have permission to do this" };
  // 768 "invalid channelID": the channel was deleted after the tree the session had.
  if (/invalid\s*channel\s*id|\bid[\s=:]*768\b/.test(normalized)) return { code: "CHANNEL_NOT_FOUND", message: "Target channel is unavailable" };
  if (/channel.*(password|password.*required)|invalid.*password|i_channel_password|781/.test(normalized)) return { code: "CHANNEL_PASSWORD_REQUIRED", message: "This channel requires a password" };
  if (/already member/.test(normalized)) return { code: "ALREADY_IN_CHANNEL", message: "You are already in this channel" };
  if (/full|maximum.*clients/.test(normalized)) return { code: "CHANNEL_FULL", message: "This channel is full" };
  if (/not found|unknown client|invalid client/.test(normalized)) return { code: "CLIENT_NOT_FOUND", message: "Client is offline or not visible" };
  return { code: fallbackCode, message: fallbackMessage };
}

export function sendProtocolError(sendJson: (message: Record<string, unknown>) => void, code: MessageCode, message: string, params?: MessageParams): void {
  sendJson({ type: "error", error: { code, message, ...(params ? { params } : {}), recoverable: false } });
}

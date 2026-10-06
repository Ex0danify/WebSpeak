import { normalizeTeamSpeakError, teamSpeakServerErrorCode } from "../../../shared/errors.js";
import { isRecord } from "../directory/voiceDirectoryView.js";

export function publicFailureDetail(error: ReturnType<typeof normalizeTeamSpeakError>): string | undefined {
  const serverMessage = error.diagnostics.serverMessage?.trim();
  const serverId = error.diagnostics.id?.trim();
  const detail = [serverMessage, serverId ? `server error id=${serverId}` : ""].filter(Boolean).join("; ");
  const safe = detail.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
  return safe || undefined;
}

export function classifyOperationError(error: unknown, fallbackCode: string, fallbackMessage: string): { code: string; message: string } {
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
    if (serverCode === "identity_security_level_too_low") return { code: "PERMISSION_DENIED", message: "你没有执行此操作的权限" };
    if (serverCode === "channel_password_required") return { code: "CHANNEL_PASSWORD_REQUIRED", message: "该频道需要密码" };
    if (serverCode === "server_full") return { code: "CHANNEL_FULL", message: "该频道已满" };
    if (serverCode === "client_version_outdated") return { code: "CLIENT_VERSION_OUTDATED", message: "客户端版本过旧，服务器拒绝了该操作" };
    if (serverCode === "flooding") return { code: "FLOOD_PROTECTION", message: "操作过于频繁，请稍后重试" };
    if (serverCode === "banned") return { code: "BANNED", message: "你已被该服务器封禁" };
    if (serverCode === "connection_initialisation_failed") return { code: "CONNECTION_INITIALISATION_FAILED", message: "TeamSpeak 服务器未能完成连接初始化，请稍后重试" };
  }
  if (/permission|not permitted|insufficient|i_permission|2568/.test(normalized)) return { code: "PERMISSION_DENIED", message: "你没有执行此操作的权限" };
  // 768 "invalid channelID": the channel was deleted after the tree the session had.
  if (/invalid\s*channel\s*id|\bid[\s=:]*768\b/.test(normalized)) return { code: "CHANNEL_NOT_FOUND", message: "目标频道不可用" };
  if (/channel.*(password|password.*required)|invalid.*password|i_channel_password|781/.test(normalized)) return { code: "CHANNEL_PASSWORD_REQUIRED", message: "该频道需要密码" };
  if (/already member/.test(normalized)) return { code: "ALREADY_IN_CHANNEL", message: "你已经在该频道中" };
  if (/full|maximum.*clients/.test(normalized)) return { code: "CHANNEL_FULL", message: "该频道已满" };
  if (/not found|unknown client|invalid client/.test(normalized)) return { code: "CLIENT_NOT_FOUND", message: "成员已离线" };
  return { code: fallbackCode, message: fallbackMessage };
}

export function sendProtocolError(sendJson: (message: Record<string, unknown>) => void, code: string, message: string): void {
  sendJson({ type: "error", error: { code, message, recoverable: false } });
}

import {
  CONNECTION_FAILURE_MESSAGES,
  NICKNAME_LENGTH_MESSAGE,
  NICKNAME_LENGTH_SIGNATURE,
  normalizedClientErrorCode,
  safeClientErrorCode,
  safeClientErrorDetail,
} from "./sessionErrors";

export function joinTicketReason(code: string, detail?: unknown): string {
  const messages: Record<string, string> = {
    ORIGIN_REJECTED: "请求来源不受信任，请从正确的网站入口重新打开",
    NOT_INITIALIZED: "WebSpeak 尚未完成配置，请联系管理员",
    RATE_LIMITED: "请求过于频繁，请稍后重试",
    TARGET_NOT_ALLOWED: "此 TeamSpeak 服务器地址不允许连接",
    ACCELERATION_UNAVAILABLE: "当前中继加速不可用，请关闭加速或联系管理员",
    INVALID_NICKNAME: "请输入有效的昵称",
    INVITE_INVALID: "邀请链接已失效或已被撤销",
  };
  const normalized = normalizedClientErrorCode(code);
  return messages[normalized] ?? connectionFailureMessage(normalized, detail);
}

// 网关关闭码 → 前端可解释错误码的映射：4000-4003 是网关/会话级，4004/4005 是
// TeamSpeak 拒绝与身份冲突，4006 是中继加速，1001 是网关主动重启（F17），
// 1006/1011 是传输级掉线，绝不能被误当成 TeamSpeak 服务器拒绝。
/**
 * Gateway close codes. 4000-4003 are gateway/session level, 4004/4005 are a
 * TeamSpeak rejection and an identity conflict, 4006 is the acceleration relay,
 * 1001 is the gateway going down on purpose (F17), and 1006 is a
 * transport-level drop that must not be blamed on TeamSpeak.
 */
const GATEWAY_CLOSE_CODE_CODES: Record<number, string> = {
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
  // The gateway repeats the failure code in the close reason. Trust it when the
  // browser can explain that code, otherwise fall back to the numeric close code
  // so even a silent close maps to an actionable message.
  if (closeCode && CONNECTION_FAILURE_MESSAGES[closeCode]) return closeCode;
  return GATEWAY_CLOSE_CODE_CODES[code] ?? "CONNECTION_FAILED";
}

export function connectionFailureMessage(code: string, detail?: unknown): string {
  const messages = CONNECTION_FAILURE_MESSAGES;
  const normalized = normalizedClientErrorCode(code);
  if (messages[normalized]) return messages[normalized];
  const safeCode = safeClientErrorCode(normalized);
  const safeDetail = safeClientErrorDetail(detail);
  // The gateway classifies a refused nickname before it reaches the browser,
  // but translate the raw TeamSpeak signature too: a nickname problem must
  // never end up as the generic "check your network" fallback.
  if (safeDetail && NICKNAME_LENGTH_SIGNATURE.test(safeDetail)) return NICKNAME_LENGTH_MESSAGE;
  return `TeamSpeak 连接失败（错误代码：${safeCode}）${safeDetail ? `：${safeDetail}` : ""}，请检查输入、网络或服务器状态`;
}

export function closeReason(code: number, reason = ""): string {
  const failureCode = closeErrorCode(code, reason);
  if (code === 4004 && failureCode === "SERVER_REJECTED") return "服务器当前已满或拒绝了连接，请稍后重试";
  return connectionFailureMessage(failureCode);
}

export function protocolErrorMessage(code: string, fallback: string): string {
  const messages: Record<string, string> = {
    INVALID_JSON: "消息格式无效",
    INVALID_MESSAGE: "消息格式无效",
    INVALID_REQUEST_ID: "请求标识无效",
    UNKNOWN_MESSAGE_TYPE: "不支持的操作",
    INVALID_PAYLOAD: "操作参数无效",
    INVALID_CHANNEL_ID: "频道标识无效",
    INVALID_CHANNEL_PASSWORD: "频道密码无效",
    INVALID_CLIENT_ID: "成员标识无效",
    INVALID_TEXT_MESSAGE: "文字消息无效",
    INVALID_POKE_MESSAGE: "戳一戳消息无效",
    INVALID_AWAY_STATUS: "离开状态无效",
    INVALID_AUDIO_FRAME: "音频帧格式无效",
    INVALID_MEMBER_VOLUME: "成员音量无效",
    INVALID_WHISPER_TARGETS: "私语目标无效",
    INVALID_WHISPER_STATE: "私语状态无效",
    NO_WHISPER_TARGETS: "请先选择私语目标",
    SESSION_NOT_READY: "TeamSpeak 会话尚未就绪",
    CHANNEL_SWITCH_FAILED: "频道切换失败",
    CHANNEL_PASSWORD_REQUIRED: "该频道需要密码",
    CHANNEL_FULL: "该频道已满",
    CANNOT_MOVE_SELF: "不能移动自己的客户端",
    CHANNEL_NOT_FOUND: "目标频道不可用",
    NICKNAME_IN_USE: "该昵称已被占用，请更换昵称",
    CLIENT_VERSION_OUTDATED: "客户端版本过旧，服务器拒绝了该操作",
    FLOOD_PROTECTION: "操作过于频繁，请稍后重试",
    BANNED: "你已被该服务器封禁",
    KICKED: "你已被服务器移出",
    PERMISSION_DENIED: "你没有执行此操作的权限",
    CLIENT_NOT_FOUND: "成员已离线",
    OPERATION_FAILED: "操作失败",
  };
  const normalized = normalizedClientErrorCode(code, "OPERATION_FAILED");
  if (messages[normalized]) return messages[normalized];
  const safeCode = safeClientErrorCode(normalized);
  const safeFallback = safeClientErrorDetail(fallback);
  return `操作失败（错误代码：${safeCode}）${safeFallback ? `：${safeFallback}` : ""}`;
}

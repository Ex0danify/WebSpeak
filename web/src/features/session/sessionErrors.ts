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

// TeamSpeak 对非法昵称没有独立错误码：长度违规统一报 invalid parameter size
// （服务器错误 id 1541），该特征串是网关能转发的唯一机器可读线索，因此把匹配器
// 与解释文案放在一起，保证两者同步演进。
/**
 * TeamSpeak has no dedicated error for a nickname it refuses: a nickname outside
 * its length rules is answered with "invalid parameter size" and server error id
 * 1541. That signature is the only machine-readable hint the gateway can forward,
 * so keep the matcher next to the message builder that explains it to the user.
 */
export const NICKNAME_LENGTH_SIGNATURE = /invalid[\s_-]*parameter[\s_-]*size|\bid[\s=:]*1541\b|nickname.{0,30}(?:length|size)/i;

/** Shown whenever TeamSpeak refuses the nickname because of its length. */
export const NICKNAME_LENGTH_MESSAGE = "昵称长度不符合 TeamSpeak 服务器要求，至少 3 个字符，请修改后重试";

/**
 * Every code this client can render for a failed connection. A code is regarded
 * as "explainable" only when it appears here, which is also what keeps the
 * gateway close codes from being replaced by an unknown close reason.
 */
export const CONNECTION_FAILURE_MESSAGES: Record<string, string> = {
  ORIGIN_REJECTED: "请求来源不受信任，请从正确的网站入口重新打开",
  NOT_INITIALIZED: "WebSpeak 尚未完成配置，请联系管理员",
  RATE_LIMITED: "请求过于频繁，请稍后重试",
  INVALID_TARGET: "TeamSpeak 服务器地址无效",
  INVALID_NICKNAME: NICKNAME_LENGTH_MESSAGE,
  HOST_NOT_FOUND: "找不到 TeamSpeak 服务器主机名，请检查地址",
  UNREACHABLE: "无法到达 TeamSpeak 服务器，请检查网络或地址",
  CONNECTION_REFUSED: "TeamSpeak 服务器拒绝了连接，请检查端口和服务状态",
  CONNECTION_RESET: "TeamSpeak 连接被服务器或网络重置，请稍后重试",
  TIMEOUT: "连接 TeamSpeak 超时，请检查网络或服务器状态",
  SERVER_PASSWORD_REQUIRED: "该服务器需要密码，请输入密码后重试",
  INVALID_SERVER_PASSWORD: "服务器密码错误，请重新输入",
  PROTOCOL_NEGOTIATION_FAILED: "TeamSpeak 协议协商失败",
  SERVER_REJECTED: "TeamSpeak 服务器拒绝了连接",
  CHANNEL_PASSWORD_REQUIRED: "该频道需要密码",
  NICKNAME_IN_USE: "该昵称已被服务器上的其他用户占用，请更换昵称",
  IDENTITY_SECURITY_LEVEL_TOO_LOW: "你的身份安全等级低于该服务器要求，请提升后重试",
  IDENTITY_LIMIT_REACHED: "该身份建立的连接数已达上限，请关闭其他连接后重试",
  CLIENT_VERSION_OUTDATED: "客户端版本过旧，服务器拒绝连接，请升级后重试",
  FLOOD_PROTECTION: "操作过于频繁，已被服务器洪水防护暂时拒绝，请稍后重试",
  BANNED: "你已被该服务器封禁，无法连接",
  KICKED: "你已被服务器移出",
  SERVER_SHUTTING_DOWN: "TeamSpeak 服务器正在关闭，暂时无法连接",
  CONNECTION_INITIALISATION_FAILED: "TeamSpeak 服务器未能完成连接初始化，请检查地址、端口或稍后重试",
  SERVER_FULL: "服务器当前已满，请稍后重试",
  INVALID_PARAMETER: "TeamSpeak 服务器拒绝了参数，通常是昵称长度或格式不合规",
  IDENTITY_IN_USE: "此 TeamSpeak 身份已在另一个浏览器页面使用，请关闭另一条连接或取消“保持身份”后重试",
  CONNECTION_FAILED: "TeamSpeak 连接失败，请检查地址、网络或服务器状态",
  // Gateway close codes: these replace the generic "connection failed" when the
  // gateway drops the socket itself (see GATEWAY_CLOSE_CODE_CODES).
  JOIN_TICKET_REQUIRED: "语音会话票据缺失或已过期，请返回列表重新进入语音空间",
  IDENTITY_INVALID: "语音网关拒绝了本次连接：身份无效，请取消“保持身份”后重新进入",
  IDENTITY_REJECTED: "语音网关拒绝了本次连接：身份无效或无法在此页面使用，请取消“保持身份”后重新进入",
  ACCELERATION_UNAVAILABLE: "当前中继加速不可用，请关闭加速后重试或联系管理员",
  GATEWAY_NETWORK_LOST: "与语音网关的网络连接异常中断（掉线或代理断开），并非 TeamSpeak 服务器拒绝连接，请检查网络后重新进入",
  GATEWAY_SESSION_ENDED: "语音网关会话意外结束，请重新进入语音空间",
  GATEWAY_RESTARTING: "语音网关正在重启或维护，请稍候片刻后重新进入",
  ADMIN_TERMINATED: "管理员已结束你的本次语音会话，如需继续请重新进入",
  TEAM_SPEAK_CLIENT_UNAVAILABLE: "语音网关未能创建 TeamSpeak 客户端（服务器可能已关闭或地址不可达），请确认服务器地址或稍后重试",
};

import type { Language } from "@/i18n/common";
import type { AdminConnectionRecord, ManagedInvite } from "../stores/adminOperations.js";

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** The admin console's display formatters, bound to the current language (`language.value` is read on
 *  every call, so a language switch shows up without rebuilding them). `sessionStateLabel`, `eventName`
 *  and `errorText` keep their own inline per-language tables next to `i18n/admin`; folding those into
 *  the i18n tree is a separate decision. */
export function createAdminFormat(language: { value: Language }, t: Translate) {
  function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat(language.value === "zh" ? "zh-CN" : language.value === "de" ? "de-DE" : language.value === "ru" ? "ru-RU" : language.value === "ja" ? "ja-JP" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—"; }
  function formatUptime(seconds: number) { const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60); if (language.value === "zh") return `已运行 ${hours} 小时 ${minutes} 分钟`; if (language.value === "de") return `${hours} Std. ${minutes} Min. aktiv`; if (language.value === "ru") return `Работает ${hours} ч ${minutes} мин`; if (language.value === "ja") return `${hours}時間 ${minutes}分 稼働`; return `Up ${hours}h ${minutes}m`; }
  function formatAge(seconds: number | null) { if (seconds == null) return "—"; if (seconds < 60) { if (language.value === "zh") return `${seconds} 秒`; if (language.value === "de") return `${seconds} Sek.`; if (language.value === "ru") return `${seconds} с`; if (language.value === "ja") return `${seconds}秒`; return `${seconds}s`; } const minutes = Math.floor(seconds / 60); if (minutes < 60) { if (language.value === "zh") return `${minutes} 分钟`; if (language.value === "de") return `${minutes} Min.`; if (language.value === "ru") return `${minutes} мин`; if (language.value === "ja") return `${minutes}分`; return `${minutes}m`; } const hours = Math.floor(minutes / 60); const rest = minutes % 60; if (language.value === "zh") return `${hours} 小时 ${rest} 分钟`; if (language.value === "de") return `${hours} Std. ${rest} Min.`; if (language.value === "ru") return `${hours} ч ${rest} мин`; if (language.value === "ja") return `${hours}時間 ${rest}分`; return `${hours}h ${rest}m`; }
  function connectionStatusLabel(status: AdminConnectionRecord["status"]) { const names: Record<AdminConnectionRecord["status"], string> = { active: "connectionActive", connecting: "connectionConnecting", disconnected: "connectionDisconnected", failed: "connectionFailed" }; return t(names[status]); }
  function connectionRoute(record: AdminConnectionRecord) {
    const route = t("connectionFromTo", { ip: record.clientIp || "—", target: record.target || "—" });
    if (!record.relayName && !record.relayTarget) return route;
    const relay = [record.relayName, record.relayTarget].filter(Boolean).join(" · ") || "—";
    return `${route} · ${t("connectionViaRelay", { relay })}`;
  }
  function sessionStateLabel(state: string) { const names: Record<string, { zh: string; en: string; de: string }> = { connecting: { zh: "连接中", en: "Connecting", de: "Verbindung wird hergestellt" }, authenticating: { zh: "认证中", en: "Authenticating", de: "Authentifizierung" }, syncing: { zh: "同步中", en: "Syncing", de: "Synchronisierung" }, connected: { zh: "已连接", en: "Connected", de: "Verbunden" }, interrupted: { zh: "已中断", en: "Interrupted", de: "Unterbrochen" }, reconnecting: { zh: "重连中", en: "Reconnecting", de: "Wiederverbindung" }, disconnecting: { zh: "断开中", en: "Disconnecting", de: "Wird getrennt" }, failed: { zh: "失败", en: "Failed", de: "Fehlgeschlagen" }, idle: { zh: "空闲", en: "Idle", de: "Inaktiv" } }; const locale = language.value === "zh" ? "zh" : language.value === "de" ? "de" : "en"; return names[state]?.[locale] ?? state; }
  function inviteStatusLabel(status: ManagedInvite["status"]) { const names: Record<ManagedInvite["status"], string> = { active: "active", expired: "expired", exhausted: "exhausted", revoked: "revoked" }; return t(names[status]); }
  function formatContext(context: Record<string, string | number | boolean>) { return Object.entries(context).map(([key, value]) => `${key}=${value}`).join(" · "); }
  function eventName(event: string) { if (event === "ADMIN_LOGIN_FAILED") return language.value === "zh" ? "管理员登录失败" : language.value === "ru" ? "Ошибка входа администратора" : language.value === "ja" ? "管理者ログイン失敗" : language.value === "de" ? "Administrator-Anmeldung fehlgeschlagen" : "Administrator login failed"; if (event === "CONNECTION_TEST_SUCCEEDED") return language.value === "zh" ? "连接测试成功" : language.value === "ru" ? "Проверка подключения успешна" : language.value === "ja" ? "接続テスト成功" : language.value === "de" ? "Verbindungstest erfolgreich" : "Connection test succeeded"; if (event === "CONNECTION_TEST_FAILED") return language.value === "zh" ? "连接测试失败" : language.value === "ru" ? "Проверка подключения не удалась" : language.value === "ja" ? "接続テスト失敗" : language.value === "de" ? "Verbindungstest fehlgeschlagen" : "Connection test failed"; const names: Record<string, string> = { ADMIN_LOGIN_SUCCEEDED: "loginEvent", ADMIN_LOGOUT: "logoutEvent", SETTINGS_CHANGED: "settingsEvent", ADMIN_INITIALIZED: "initializedEvent", LEGACY_CONFIG_IMPORTED: "importedEvent", CONNECTION_TEST: "testEvent" }; return names[event] ? t(names[event]) : language.value === "zh" ? "系统事件" : event.replaceAll("_", " "); }
  function errorText(code?: string) {
    if (code === "INVALID_PASSWORD") return t('invalidPassword');
    if (code === "INVALID_ADMIN_PASSWORD") return t('setupPasswordShort');
    if (code === "PASSWORD_CHANGE_REQUIRED") return t('changePasswordLead');
    if (code === "RATE_LIMITED") return t('rateLimited');
    if (code === "INVALID_WEBRTC_PORT_RANGE") {
      if (language.value === "zh") return "WebRTC UDP 端口范围无效，请填写 1024–65535 且起始端口不能大于结束端口。";
      if (language.value === "de") return "Der WebRTC-UDP-Portbereich ist ungültig. Verwende 1024–65535; der Startport darf nicht größer als der Endport sein.";
      if (language.value === "ru") return "Диапазон UDP-портов WebRTC некорректен. Используйте 1024–65535; начальный порт не может быть больше конечного.";
      if (language.value === "ja") return "WebRTC UDP ポート範囲が正しくありません。1024–65535 の範囲で、開始ポートを終了ポート以下にしてください。";
      return "The WebRTC UDP port range is invalid. Use 1024–65535 with the start no greater than the end.";
    }
    if (code === "WEBRTC_PORT_LOCKED") {
      if (language.value === "zh") return "WebRTC 已开启，请先关闭并保存后再修改端口范围。";
      if (language.value === "de") return "WebRTC ist aktiviert. Deaktiviere es und speichere zuerst, bevor du den Portbereich änderst.";
      if (language.value === "ru") return "WebRTC включён. Сначала отключите его и сохраните настройки, затем изменяйте диапазон портов.";
      if (language.value === "ja") return "WebRTC が有効です。ポート範囲を変更する前に無効にして保存してください。";
      return "WebRTC is enabled. Turn it off and save before changing the port range.";
    }
    const locale = language.value === "zh" ? "zh" : language.value === "de" ? "de" : "en";
    const relayErrors: Record<string, { zh: string; en: string; de: string }> = {
      INVALID_RELAY_NAME: { zh: "中继名称无效或为空。", en: "The relay name is invalid or empty.", de: "Der Relay-Name ist ungültig oder leer." },
      INVALID_RELAY_TARGET: { zh: "中继服务器地址无效。", en: "The relay server address is invalid.", de: "Die Relay-Serveradresse ist ungültig." },
      INVALID_RELAY_TOKEN: { zh: "启用中继时必须填写令牌。", en: "A relay token is required when the relay is enabled.", de: "Beim Aktivieren des Relays ist ein Token erforderlich." },
    };
    if (relayErrors[code || ""]) return relayErrors[code || ""][locale];
    const probe: Record<string, { zh: string; en: string; de: string }> = {
      INVALID_TARGET: { zh: "TeamSpeak 服务器地址格式无效。", en: "The TeamSpeak server address is invalid.", de: "Die TeamSpeak-Serveradresse ist ungültig." },
      PING_UNAVAILABLE: { zh: "当前运行环境没有可用的 ICMP Ping 工具。", en: "The runtime does not provide an ICMP ping tool.", de: "In der Laufzeitumgebung ist kein ICMP-Ping-Tool verfügbar." },
      HOST_NOT_FOUND: { zh: "找不到服务器主机名。", en: "The server hostname could not be resolved.", de: "Der Servername konnte nicht aufgelöst werden." },
      UNREACHABLE: { zh: "无法连接 TeamSpeak 服务器。", en: "The TeamSpeak server is unreachable.", de: "Der TeamSpeak-Server ist nicht erreichbar." },
      TIMEOUT: { zh: "连接 TeamSpeak 超时。", en: "The TeamSpeak connection timed out.", de: "Die Verbindung zu TeamSpeak ist abgelaufen." },
      PROTOCOL_NEGOTIATION_FAILED: { zh: "无法识别 TeamSpeak 协议。", en: "TeamSpeak protocol negotiation failed.", de: "Die Aushandlung des TeamSpeak-Protokolls ist fehlgeschlagen." },
      SERVER_REJECTED: { zh: "TeamSpeak 服务器拒绝了连接。", en: "The TeamSpeak server rejected the connection.", de: "Der TeamSpeak-Server hat die Verbindung abgelehnt." },
      TARGET_NOT_ALLOWED: { zh: "此地址不允许在开放模式中使用。", en: "This target is not allowed in open mode.", de: "Dieses Ziel ist im offenen Modus nicht erlaubt." },
    };
    return probe[code || ""]?.[locale] ?? t('requestFailed');
  }

  function connectionFailureText(code?: string) {
    const names: Record<string, string> = {
      PASSWORD_REQUIRED: "serverPasswordRequiredError",
      SERVER_PASSWORD_REQUIRED: "serverPasswordRequiredError",
    INVALID_PASSWORD: "invalidServerPasswordError",
    INVALID_SERVER_PASSWORD: "invalidServerPasswordError",
      INVALID_TARGET: "serverAddress",
      INVALID_NICKNAME: "invalidNicknameError",
    HOST_NOT_FOUND: "hostNotFoundError",
    UNREACHABLE: "networkUnreachableError",
    CONNECTION_REFUSED: "connectionRefusedError",
    CONNECTION_RESET: "connectionResetError",
    TIMEOUT: "networkTimeoutError",
      PROTOCOL_NEGOTIATION_FAILED: "protocolFailureError",
      SERVER_REJECTED: "serverRejectedError",
    NO_ANSWER: "noAnswerError",
    PING_UNAVAILABLE: "pingUnavailableError",
    CONNECTION_FAILED: "connectionFailed",
    };
    return names[code || ""] ? t(names[code || ""]) : errorText(code);
  }

  return { formatDate, formatUptime, formatAge, connectionStatusLabel, connectionRoute, sessionStateLabel, inviteStatusLabel, formatContext, eventName, errorText, connectionFailureText };
}

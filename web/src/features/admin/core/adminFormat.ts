import type { MessageKey } from "@/shared/i18n/messageKeys";
import { intlLocale, type Language } from "@/shared/i18n/languages";
import { createFormat } from "@/shared/i18n/useFormat";
import type { AdminConnectionRecord, ManagedInvite } from "@/features/admin/core/adminTypes.js";

const CONNECTION_FAILED: MessageKey = "connectionFailed";

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

const SESSION_STATE_KEYS: Record<string, MessageKey> = {
  connecting: "stateConnecting",
  authenticating: "stateAuthenticating",
  syncing: "stateSyncing",
  connected: "stateConnected",
  interrupted: "stateInterrupted",
  reconnecting: "stateReconnecting",
  disconnecting: "stateDisconnecting",
  failed: "stateFailed",
  idle: "stateIdle",
};

const EVENT_KEYS: Record<string, MessageKey> = {
  ADMIN_LOGIN_FAILED: "adminLoginFailedEvent",
  CONNECTION_TEST_SUCCEEDED: "connectionTestSucceededEvent",
  CONNECTION_TEST_FAILED: "connectionTestFailedEvent",
  ADMIN_LOGIN_SUCCEEDED: "loginEvent",
  ADMIN_LOGOUT: "logoutEvent",
  SETTINGS_CHANGED: "settingsEvent",
  ADMIN_INITIALIZED: "initializedEvent",
  SERVER_ADDED: "serverAddedEvent",
  SERVER_UPDATED: "serverUpdatedEvent",
  SERVER_REMOVED: "serverRemovedEvent",
};

const ADMIN_ERROR_KEYS: Record<string, MessageKey> = {
  INVALID_PASSWORD: "invalidPassword",
  INVALID_ADMIN_PASSWORD: "setupPasswordShort",
  PASSWORD_CHANGE_REQUIRED: "changePasswordLead",
  RATE_LIMITED: "rateLimited",
  GATEWAY_UNREACHABLE: "adminErr_GATEWAY_UNREACHABLE",
  INVALID_WEBRTC_PORT_RANGE: "adminErr_INVALID_WEBRTC_PORT_RANGE",
  WEBRTC_PORT_LOCKED: "adminErr_WEBRTC_PORT_LOCKED",
  INVALID_RELAY_NAME: "adminErr_INVALID_RELAY_NAME",
  INVALID_RELAY_TARGET: "adminErr_INVALID_RELAY_TARGET",
  INVALID_RELAY_TOKEN: "adminErr_INVALID_RELAY_TOKEN",
  INVALID_TARGET: "adminErr_INVALID_TARGET",
  PING_UNAVAILABLE: "adminErr_PING_UNAVAILABLE",
  HOST_NOT_FOUND: "adminErr_HOST_NOT_FOUND",
  UNREACHABLE: "adminErr_UNREACHABLE",
  TIMEOUT: "adminErr_TIMEOUT",
  PROTOCOL_NEGOTIATION_FAILED: "adminErr_PROTOCOL_NEGOTIATION_FAILED",
  SERVER_REJECTED: "adminErr_SERVER_REJECTED",
  TARGET_NOT_ALLOWED: "adminErr_TARGET_NOT_ALLOWED",
  INVALID_SERVER_NAME: "adminErr_INVALID_SERVER_NAME",
  SERVER_NAME_TAKEN: "adminErr_SERVER_NAME_TAKEN",
  SERVER_LIMIT: "adminErr_SERVER_LIMIT",
  SERVER_NOT_FOUND: "adminErr_SERVER_NOT_FOUND",
  SERVERS_REQUIRED: "adminErr_SERVERS_REQUIRED",
  INVALID_SERVER_ORDER: "adminErr_INVALID_SERVER_ORDER",
  INVALID_IDENTITY_MINT_LEVEL: "adminErr_INVALID_IDENTITY_MINT_LEVEL",
  INVALID_IDENTITY_MINT_CONCURRENCY: "adminErr_INVALID_IDENTITY_MINT_CONCURRENCY",
  INVALID_IDENTITY_MINT_QUEUE_DEPTH: "adminErr_INVALID_IDENTITY_MINT_QUEUE_DEPTH",
};

/** The admin console's display formatters, bound to the current language (`language.value` is read on
 *  every call, so a language switch shows up without rebuilding them). */
export function createAdminFormat(language: { value: Language }, t: Translate) {
  function formatDate(value: string | null) {
    return value ? createFormat(intlLocale(language.value)).dateTime(value) : "—";
  }
  function formatUptime(seconds: number) {
    return t("uptime", { duration: createFormat(intlLocale(language.value)).duration(seconds) });
  }
  function formatAge(seconds: number | null) {
    if (seconds == null) return "—";
    const format = createFormat(intlLocale(language.value));
    if (seconds < 60) return format.duration(seconds);
    // Whole minutes below an hour, hours and minutes above, seconds are noise at this scale.
    return format.duration(Math.floor(seconds / 60) * 60);
  }
  function connectionStatusLabel(status: AdminConnectionRecord["status"]) {
    const names: Record<AdminConnectionRecord["status"], MessageKey> = {
      active: "connectionActive",
      connecting: "connectionConnecting",
      disconnected: "connectionDisconnected",
      failed: CONNECTION_FAILED,
    };
    return t(names[status]);
  }
  function connectionRoute(record: AdminConnectionRecord) {
    const route = t("connectionFromTo", { ip: record.clientIp || "—", target: record.target || "—" });
    if (!record.relayName && !record.relayTarget) return route;
    const relay = [record.relayName, record.relayTarget].filter(Boolean).join(" · ") || "—";
    return `${route} · ${t("connectionViaRelay", { relay })}`;
  }
  function sessionStateLabel(state: string) {
    return SESSION_STATE_KEYS[state] ? t(SESSION_STATE_KEYS[state]) : state;
  }
  function inviteStatusLabel(status: ManagedInvite["status"]) {
    const names: Record<ManagedInvite["status"], MessageKey> = {
      active: "active",
      expired: "expired",
      exhausted: "exhausted",
      revoked: "revoked",
    };
    return t(names[status]);
  }
  function formatContext(context: Record<string, string | number | boolean>) {
    return Object.entries(context)
      .map(([key, value]) => `${key}=${value}`)
      .join(" · ");
  }
  function eventName(event: string) {
    return EVENT_KEYS[event] ? t(EVENT_KEYS[event]) : event.replaceAll("_", " ");
  }
  function errorText(code?: string) {
    return ADMIN_ERROR_KEYS[code || ""] ? t(ADMIN_ERROR_KEYS[code || ""]) : t("requestFailed");
  }

  function connectionFailureText(code?: string) {
    const names: Record<string, MessageKey> = {
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
      CONNECTION_FAILED: CONNECTION_FAILED,
    };
    return names[code || ""] ? t(names[code || ""]) : errorText(code);
  }

  return {
    formatDate,
    formatUptime,
    formatAge,
    connectionStatusLabel,
    connectionRoute,
    sessionStateLabel,
    inviteStatusLabel,
    formatContext,
    eventName,
    errorText,
    connectionFailureText,
  };
}

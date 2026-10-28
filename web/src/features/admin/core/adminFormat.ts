import type { MessageKey } from "@/shared/i18n/messageKeys";
import { intlLocale, type Language } from "@/shared/i18n/languages";
import { createFormat } from "@/shared/i18n/useFormat";
import type {
  AdminConnectionAudio,
  AdminConnectionAudioPath,
  AdminConnectionRecord,
  AdminSession,
  ManagedInvite,
} from "@/features/admin/core/adminTypes.js";

const CONNECTION_FAILED: MessageKey = "connectionFailed";

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

const PLATFORM_KEYS: Record<string, MessageKey> = {
  desktop: "connectionPlatformDesktop",
  mobile: "connectionPlatformMobile",
  tablet: "connectionPlatformTablet",
  tv: "connectionPlatformTv",
};

const ICE_STATE_KEYS: Record<string, MessageKey> = {
  new: "connectionIceNew",
  connecting: "connectionIceConnecting",
  connected: "connectionIceConnected",
  disconnected: "connectionIceDisconnected",
  failed: "connectionIceFailed",
  closed: "connectionIceClosed",
};

const ICE_TYPE_KEYS: Record<string, MessageKey> = {
  host: "connectionIceHost",
  srflx: "connectionIceSrflx",
  prflx: "connectionIcePrflx",
  relay: "connectionIceRelay",
};

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
  INVALID_EVENT_LOG_RETENTION: "adminErr_INVALID_EVENT_LOG_RETENTION",
  INVALID_EVENT_LOG_ROWS: "adminErr_INVALID_EVENT_LOG_ROWS",
  INVALID_CONNECTION_RETENTION: "adminErr_INVALID_CONNECTION_RETENTION",
  INVALID_CONNECTION_ROWS: "adminErr_INVALID_CONNECTION_ROWS",
  INVALID_PRIVACY_NOTICE_URL: "adminErr_INVALID_PRIVACY_NOTICE_URL",
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
  /** What a session carried, one line each: the voice traffic, the drops and errors when there were any, and the way it travelled. */
  function connectionAudioLines(audio: AdminConnectionAudio | null): string[] {
    if (!audio) return [];
    const count = (value: number) => new Intl.NumberFormat(intlLocale(language.value)).format(value);
    const lines = [
      t("connectionAudioSummary", {
        talk: formatAge(audio.talkSeconds),
        sent: count(audio.framesSent),
        received: count(audio.framesReceived),
      }),
    ];
    if (audio.droppedFrames > 0) lines.push(t("connectionAudioDropped", { count: count(audio.droppedFrames) }));
    if (audio.sendErrors > 0) lines.push(t("connectionAudioSendErrors", { count: count(audio.sendErrors) }));
    if (audio.path) lines.push(...connectionPathLines(audio.path, count));
    return lines;
  }
  function connectionPathLines(path: AdminConnectionAudioPath, count: (value: number) => string): string[] {
    const lines = [
      t(path.transport === "webrtc" ? "connectionPathWebrtc" : "connectionPathSocket", {
        up: count(path.uplinkFrames),
        upGap: count(path.uplinkMaxGapMs),
        down: count(path.downlinkFrames),
        downGap: count(path.downlinkMaxGapMs),
      }),
    ];
    if (path.queueUnderruns + path.lateTicks + path.decodeErrors > 0) {
      lines.push(
        t("connectionPathGateway", {
          underruns: count(path.queueUnderruns),
          late: count(path.lateTicks),
          errors: count(path.decodeErrors),
        }),
      );
    }
    const { ice } = path;
    if (ice) {
      const parts = [t("connectionIceState", { state: ICE_STATE_KEYS[ice.state] ? t(ICE_STATE_KEYS[ice.state]!) : ice.state })];
      if (ice.remoteType) {
        const type = ICE_TYPE_KEYS[ice.remoteType] ? t(ICE_TYPE_KEYS[ice.remoteType]!) : ice.remoteType;
        parts.push(t("connectionIcePath", { type, protocol: (ice.protocol ?? "—").toUpperCase() }));
      }
      if (ice.rttMs != null) parts.push(t("connectionIceRtt", { ms: count(ice.rttMs) }));
      if (ice.connectMs != null) parts.push(t("connectionIceConnect", { ms: count(ice.connectMs) }));
      lines.push(parts.join(" · "));
    }
    return lines;
  }
  /** The browser a guest joined with: what it was read as, and the user agent exactly as it was reported. */
  function connectionClientLines(record: Pick<AdminConnectionRecord, "client" | "userAgent">): string[] {
    const { client, userAgent } = record;
    const lines: string[] = [];
    if (client) {
      const parts = [
        [client.browser, client.browserVersion].filter(Boolean).join(" "),
        [client.os, client.osVersion].filter(Boolean).join(" "),
        client.platform ? (PLATFORM_KEYS[client.platform] ? t(PLATFORM_KEYS[client.platform]!) : client.platform) : "",
      ].filter(Boolean);
      if (parts.length > 0) lines.push(t("connectionClient", { client: parts.join(" · ") }));
    }
    if (userAgent) lines.push(t("connectionUserAgent", { agent: userAgent }));
    return lines;
  }
  /** Where a live session comes from: the guest's address, and the relay when it goes through one. */
  function sessionOrigin(session: Pick<AdminSession, "clientIp" | "relayName" | "relayTarget">) {
    const parts = [session.clientIp && t("sessionGuestIp", { ip: session.clientIp })];
    const relay = [session.relayName, session.relayTarget].filter(Boolean).join(" · ");
    if (relay) parts.push(t("connectionViaRelay", { relay }));
    return parts.filter(Boolean).join(" · ");
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
      GATEWAY_RESTARTED: "gatewayRestartedError",
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
    connectionAudioLines,
    connectionClientLines,
    sessionOrigin,
    sessionStateLabel,
    inviteStatusLabel,
    errorText,
    connectionFailureText,
  };
}

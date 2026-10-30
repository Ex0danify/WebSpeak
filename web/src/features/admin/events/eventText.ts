import type { MessageKey } from "@/shared/i18n/messageKeys";
import type { Language } from "@/shared/i18n/languages";
import type { Ref } from "vue";
import type { AdminEvent } from "@/features/admin/core/adminTypes.js";
import { createAdminFormat } from "@/features/admin/core/adminFormat.js";

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

const TITLE_KEYS: Record<string, MessageKey> = {
  ADMIN_INITIALIZED: "initializedEvent",
  ADMIN_LOGIN_SUCCEEDED: "loginEvent",
  ADMIN_LOGIN_FAILED: "adminLoginFailedEvent",
  ADMIN_LOGOUT: "logoutEvent",
  ADMIN_PASSWORD_CHANGED: "passwordChangedEvent",
  ADMIN_PASSWORD_RESET: "passwordResetEvent",
  ADMIN_SESSION_TERMINATED: "sessionTerminatedEvent",
  ADMIN_BACKUP_EXPORTED: "backupExportedEvent",
  SETTINGS_CHANGED: "settingsEvent",
  SERVER_ADDED: "serverAddedEvent",
  SERVER_UPDATED: "serverUpdatedEvent",
  SERVER_REMOVED: "serverRemovedEvent",
  SERVERS_REORDERED: "serversReorderedEvent",
  INVITE_CREATED: "inviteCreatedEvent",
  INVITE_CONSUMED: "inviteConsumedEvent",
  INVITE_REVOKED: "inviteRevokedEvent",
  SERVER_AVAILABLE: "serverAvailableEvent",
  SERVER_UNAVAILABLE: "serverUnavailableEvent",
  SESSION_CONNECTED: "sessionConnectedEvent",
  SESSION_ENDED: "sessionEndedEvent",
  SESSION_CONNECT_FAILED: "sessionConnectFailedEvent",
  GATEWAY_STARTED: "gatewayStartedEvent",
  GATEWAY_STOPPED: "gatewayStoppedEvent",
  GATEWAY_ERROR: "gatewayErrorEvent",
  CAPACITY_REACHED: "capacityReachedEvent",
};

// Labels of the fields an edit of the settings or of a server can change.
const FIELD_KEYS: Record<string, MessageKey> = {
  siteName: "siteName",
  privacyNoticeUrl: "privacyNoticeUrl",
  accessMode: "eventFieldAccessMode",
  webRtcEnabled: "webrtcEnabled",
  webRtcUdpStart: "webrtcPortStart",
  webRtcUdpEnd: "webrtcPortEnd",
  identityMintMaxLevel: "identityMintMaxLevel",
  identityMintConcurrency: "identityMintConcurrency",
  identityMintQueueDepth: "identityMintQueueDepth",
  eventLogRetentionDays: "eventFieldEventLogDays",
  eventLogMaxRows: "eventFieldEventLogRows",
  connectionRetentionDays: "eventFieldConnectionDays",
  connectionMaxRows: "eventFieldConnectionRows",
  logRetentionDays: "eventFieldLogDays",
  welcomeTexts: "welcomeText",
  relayNodes: "relaySettings",
  name: "serverName",
  target: "serverAddress",
  password: "serverPassword",
};

export interface EventDetail {
  /** One line: what the event is about and where it came from. */
  summary: string;
  /** One line per changed field. */
  changes: string[];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

type Details = AdminEvent["details"];
type EventHelpers = Pick<ReturnType<typeof createAdminFormat>, "connectionFailureText" | "formatAge" | "formatDate"> & { t: Translate };

function noChanges(details: Details): boolean {
  return Array.isArray(details.changes) && details.changes.length === 0;
}

function sessionParts({ t }: EventHelpers, details: Details): string[] {
  return [text(details.nickname), text(details.clientIp) && t("eventIp", { ip: text(details.clientIp) }), text(details.target)];
}

function usesText({ t }: EventHelpers, details: Details): string {
  const max = Number(details.maxUses);
  if (!Number.isFinite(max)) return "";
  return max > 0 ? t("eventMaxUses", { count: max }) : t("eventUnlimitedUses");
}

function usedText({ t }: EventHelpers, used: number, max: number): string {
  return max > 0 ? t("eventUsed", { used, max }) : t("eventUsedUnlimited", { used });
}

function revokedText({ t }: EventHelpers, details: Details): string {
  const count = Number(details.revokedInvites);
  return count > 0 ? t("eventInvitesRevoked", { count }) : "";
}

function adminParts({ t }: EventHelpers, { event, details }: AdminEvent): string[] {
  switch (event) {
    case "ADMIN_LOGIN_FAILED":
      return text(details.username) ? [t("eventUser", { name: text(details.username) })] : [];
    case "ADMIN_SESSION_TERMINATED":
      return [text(details.nickname), text(details.target)];
    case "SETTINGS_CHANGED":
      return noChanges(details) ? [t("eventNoChanges")] : [];
    default:
      return [];
  }
}

function serverParts(h: EventHelpers, { event, details }: AdminEvent): string[] {
  const { t } = h;
  switch (event) {
    case "SERVER_ADDED":
      return [text(details.name), text(details.target)];
    case "SERVER_UPDATED":
      return [text(details.name), text(details.target), revokedText(h, details), ...(noChanges(details) ? [t("eventNoChanges")] : [])];
    case "SERVER_REMOVED":
      return [text(details.name), revokedText(h, details)];
    case "SERVER_UNAVAILABLE":
      return [text(details.name), h.connectionFailureText(text(details.code))];
    case "SERVER_AVAILABLE":
      return [text(details.name), ...(typeof details.latencyMs === "number" ? [t("eventLatency", { ms: details.latencyMs })] : [])];
    case "SERVERS_REORDERED":
      return typeof details.count === "number" ? [t("eventServerCount", { count: details.count })] : [];
    default:
      return [];
  }
}

function inviteParts(h: EventHelpers, { event, details }: AdminEvent): string[] {
  const { t } = h;
  const channel = text(details.channel) || t("defaultChannel");
  switch (event) {
    case "INVITE_CREATED": {
      const parts = [text(details.serverName), channel, usesText(h, details)];
      if (text(details.expiresAt)) parts.push(t("eventExpires", { date: h.formatDate(text(details.expiresAt)) }));
      return parts;
    }
    case "INVITE_REVOKED": {
      const parts = [text(details.serverName)];
      if (typeof details.channel === "string") parts.push(channel);
      if (typeof details.useCount === "number") parts.push(usedText(h, details.useCount, Number(details.maxUses)));
      return parts;
    }
    case "INVITE_CONSUMED":
      return [text(details.serverName), channel];
    default:
      return [];
  }
}

function sessionEventParts(h: EventHelpers, { event, details }: AdminEvent): string[] {
  switch (event) {
    case "SESSION_CONNECTED":
      return sessionParts(h, details);
    case "SESSION_ENDED": {
      const parts = sessionParts(h, details);
      if (typeof details.durationSeconds === "number") parts.push(h.t("eventDuration", { duration: h.formatAge(details.durationSeconds) }));
      if (text(details.code)) parts.push(h.connectionFailureText(text(details.code)));
      return parts;
    }
    case "SESSION_CONNECT_FAILED": {
      const parts = [...sessionParts(h, details), h.connectionFailureText(text(details.code))];
      if (text(details.detail)) parts.push(text(details.detail));
      return parts;
    }
    default:
      return [];
  }
}

function gatewayParts({ t }: EventHelpers, { event, details }: AdminEvent): string[] {
  switch (event) {
    case "GATEWAY_STARTED":
      return text(details.version) ? [t("eventVersion", { version: text(details.version) })] : [];
    case "GATEWAY_STOPPED":
      return text(details.signal) ? [t("eventSignal", { signal: text(details.signal) })] : [];
    case "GATEWAY_ERROR":
      return [text(details.message)];
    case "CAPACITY_REACHED":
      return typeof details.maxSessions === "number" ? [t("eventSessionLimit", { count: details.maxSessions })] : [];
    default:
      return [];
  }
}

const PART_GROUPS = [adminParts, serverParts, inviteParts, sessionEventParts, gatewayParts];

const NAMED_VALUES = new Map<unknown, MessageKey>([
  [true, "eventValueOn"],
  [false, "eventValueOff"],
  ["open", "openMode"],
  ["fixed", "fixedMode"],
  [null, "eventValueNone"],
  [undefined, "eventValueNone"],
  ["", "eventValueNone"],
]);

function valueText(t: Translate, input: unknown): string {
  const named = NAMED_VALUES.get(input);
  if (named) return t(named);
  return typeof input === "object" ? JSON.stringify(input) : String(input);
}

function changeLine(t: Translate, change: unknown): string[] {
  if (typeof change !== "object" || change === null) return [];
  const { field, from, to } = change as Record<string, unknown>;
  const key = typeof field === "string" ? FIELD_KEYS[field] : undefined;
  if (!key) return [];
  const label = t(key);
  return "to" in change
    ? [t("eventChange", { field: label, from: valueText(t, from), to: valueText(t, to) })]
    : [t("eventChanged", { field: label })];
}

function changeLines(t: Translate, details: Details): string[] {
  return Array.isArray(details.changes) ? details.changes.flatMap((change: unknown) => changeLine(t, change)) : [];
}

/** The headline and the detail of an event of the log. */
export function createEventText(language: Ref<Language>, t: Translate) {
  const { connectionFailureText, formatAge, formatDate } = createAdminFormat(language, t);
  const helpers: EventHelpers = { t, connectionFailureText, formatAge, formatDate };

  function title(event: string) {
    return TITLE_KEYS[event] ? t(TITLE_KEYS[event]) : event.replaceAll("_", " ");
  }

  function detail(entry: AdminEvent): EventDetail {
    const { details } = entry;
    const parts = PART_GROUPS.flatMap((group) => group(helpers, entry));
    if (text(details.ip)) parts.push(t("eventIp", { ip: text(details.ip) }));
    return { summary: parts.filter(Boolean).join(" · "), changes: changeLines(t, details) };
  }

  return { title, detail };
}

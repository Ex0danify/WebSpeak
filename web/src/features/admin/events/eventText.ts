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
};

// Labels of the fields an edit of the settings or of a server can change.
const FIELD_KEYS: Record<string, MessageKey> = {
  siteName: "siteName",
  accessMode: "eventFieldAccessMode",
  webRtcEnabled: "webrtcEnabled",
  webRtcUdpStart: "webrtcPortStart",
  webRtcUdpEnd: "webrtcPortEnd",
  identityMintMaxLevel: "identityMintMaxLevel",
  identityMintConcurrency: "identityMintConcurrency",
  identityMintQueueDepth: "identityMintQueueDepth",
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

/** The headline and the detail of an event of the log. */
export function createEventText(language: Ref<Language>, t: Translate) {
  const { connectionFailureText, formatDate } = createAdminFormat(language, t);

  function title(event: string) {
    return TITLE_KEYS[event] ? t(TITLE_KEYS[event]) : event.replaceAll("_", " ");
  }

  function value(input: unknown): string {
    if (input === true) return t("eventValueOn");
    if (input === false) return t("eventValueOff");
    if (input === "open") return t("openMode");
    if (input === "fixed") return t("fixedMode");
    if (input === null || input === undefined || input === "") return t("eventValueNone");
    return String(input);
  }

  function changeLines(details: AdminEvent["details"]): string[] {
    if (!Array.isArray(details.changes)) return [];
    return details.changes.flatMap((change: unknown) => {
      if (typeof change !== "object" || change === null) return [];
      const { field, from, to } = change as Record<string, unknown>;
      const key = typeof field === "string" ? FIELD_KEYS[field] : undefined;
      if (!key) return [];
      const label = t(key);
      return "to" in change
        ? [t("eventChange", { field: label, from: value(from), to: value(to) })]
        : [t("eventChanged", { field: label })];
    });
  }

  function uses(details: AdminEvent["details"]): string {
    const max = Number(details.maxUses);
    if (!Number.isFinite(max)) return "";
    return max > 0 ? t("eventMaxUses", { count: max }) : t("eventUnlimitedUses");
  }

  function detail(entry: AdminEvent): EventDetail {
    const { details } = entry;
    const parts: string[] = [];
    const revoked = Number(details.revokedInvites) > 0 ? t("eventInvitesRevoked", { count: Number(details.revokedInvites) }) : "";
    switch (entry.event) {
      case "ADMIN_LOGIN_FAILED":
        if (text(details.username)) parts.push(t("eventUser", { name: text(details.username) }));
        break;
      case "ADMIN_SESSION_TERMINATED":
        parts.push(text(details.nickname), text(details.target));
        break;
      case "SETTINGS_CHANGED":
        if (Array.isArray(details.changes) && details.changes.length === 0) parts.push(t("eventNoChanges"));
        break;
      case "SERVER_ADDED":
        parts.push(text(details.name), text(details.target));
        break;
      case "SERVER_UPDATED":
        parts.push(text(details.name), text(details.target), revoked);
        if (Array.isArray(details.changes) && details.changes.length === 0) parts.push(t("eventNoChanges"));
        break;
      case "SERVER_REMOVED":
        parts.push(text(details.name), revoked);
        break;
      case "SERVER_UNAVAILABLE":
        parts.push(text(details.name), connectionFailureText(text(details.code)));
        break;
      case "SERVER_AVAILABLE":
        parts.push(text(details.name));
        if (typeof details.latencyMs === "number") parts.push(t("eventLatency", { ms: details.latencyMs }));
        break;
      case "INVITE_CREATED":
        parts.push(text(details.serverName), text(details.channel) || t("defaultChannel"), uses(details));
        if (text(details.expiresAt)) parts.push(t("eventExpires", { date: formatDate(text(details.expiresAt)) }));
        break;
      case "INVITE_REVOKED":
        parts.push(text(details.serverName));
        if (typeof details.channel === "string") parts.push(details.channel || t("defaultChannel"));
        if (typeof details.useCount === "number") {
          parts.push(
            Number(details.maxUses) > 0
              ? t("eventUsed", { used: details.useCount, max: Number(details.maxUses) })
              : t("eventUsedUnlimited", { used: details.useCount }),
          );
        }
        break;
      case "INVITE_CONSUMED":
        parts.push(text(details.serverName), text(details.channel) || t("defaultChannel"));
        break;
      case "SERVERS_REORDERED":
        if (typeof details.count === "number") parts.push(t("eventServerCount", { count: details.count }));
        break;
      default:
    }
    if (text(details.ip)) parts.push(t("eventIp", { ip: text(details.ip) }));
    return { summary: parts.filter(Boolean).join(" · "), changes: changeLines(details) };
  }

  return { title, detail };
}

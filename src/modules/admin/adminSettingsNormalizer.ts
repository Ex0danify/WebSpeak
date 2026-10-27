import { randomBytes } from "node:crypto";
import { parseTeamSpeakTarget, type TeamSpeakTarget } from "../../shared/teamSpeakTarget.js";
import type { AccessMode, PersistedRelayNode, SettingsUpdate, WebSpeakDatabase } from "../../infra/persistence/database.js";
import { decryptSecret, encryptSecret } from "../../infra/security/secretCrypto.js";
import { DEFAULT_ACCELERATION_RELAY_PORT } from "../relay/index.js";
import { DEFAULT_WEBRTC_UDP_PORT_RANGE, WEBRTC_UDP_PORT_MAX, WEBRTC_UDP_PORT_MIN } from "../../config/webrtcConfig.js";
import {
  DEFAULT_IDENTITY_MINT_POLICY,
  IDENTITY_MINT_CONCURRENCY_MAX,
  IDENTITY_MINT_CONCURRENCY_MIN,
  IDENTITY_MINT_LEVEL_MAX,
  IDENTITY_MINT_LEVEL_MIN,
  IDENTITY_MINT_QUEUE_DEPTH_MAX,
  IDENTITY_MINT_QUEUE_DEPTH_MIN,
} from "../../config/identityMintConfig.js";
import {
  CONNECTION_ROWS_MAX,
  CONNECTION_ROWS_MIN,
  DEFAULT_RETENTION_POLICY,
  EVENT_LOG_ROWS_MAX,
  EVENT_LOG_ROWS_MIN,
  RETENTION_DAYS_MAX,
  RETENTION_DAYS_MIN,
} from "../../config/retentionConfig.js";
import { AdminInputError } from "./adminErrors.js";

type StoredSettings = ReturnType<WebSpeakDatabase["getSettings"]>;

export interface AdminSettingsInput {
  accessMode: AccessMode;
  siteName: string;
  /** Texts to store by language code, a language left out keeps its text and an empty one clears it. */
  welcomeTexts?: Record<string, string>;
  webRtcEnabled: boolean;
  webRtcUdpStart?: number;
  webRtcUdpEnd?: number;
  identityMintMaxLevel?: number;
  identityMintConcurrency?: number;
  identityMintQueueDepth?: number;
  eventLogRetentionDays?: number;
  eventLogMaxRows?: number;
  connectionRetentionDays?: number;
  connectionMaxRows?: number;
  relayNodes?: RelayNodeInput[];
}

export interface RelayNodeInput {
  id?: string;
  name: string;
  target: string;
  enabled: boolean;
  token?: string;
  tokenAction?: "keep" | "replace" | "remove";
}

/** Cap on distinct welcome-text languages, per request and in the stored map. */
export const WELCOME_LANGUAGE_MAX = 16;

function boundedInteger(value: number, min: number, max: number, code: string, message: string): number {
  if (!Number.isInteger(value) || value < min || value > max) throw new AdminInputError(code, message);
  return value;
}

function mergeWelcomeTexts(current: Record<string, string>, input: Record<string, string> | undefined): Record<string, string> {
  const merged = { ...current };
  for (const [language, text] of Object.entries(input ?? {})) {
    const trimmed = text.trim();
    if (trimmed) merged[language] = trimmed;
    else delete merged[language];
  }
  if (Object.keys(merged).length > WELCOME_LANGUAGE_MAX) {
    throw new AdminInputError("INVALID_WELCOME_TEXT", `Welcome texts cannot cover more than ${WELCOME_LANGUAGE_MAX} languages`);
  }
  return merged;
}

export function normalizeSettings(input: AdminSettingsInput, current: StoredSettings): SettingsUpdate {
  const siteName = input.siteName.trim();
  const welcomeTexts = mergeWelcomeTexts(current.welcomeTexts, input.welcomeTexts);
  if (!siteName || siteName.length > 80) throw new AdminInputError("INVALID_SITE_NAME", "Site name must contain 1 to 80 characters");
  if (Object.values(welcomeTexts).some((text) => text.length > 500)) {
    throw new AdminInputError("INVALID_WELCOME_TEXT", "Welcome text cannot exceed 500 characters");
  }
  if (input.accessMode !== "fixed" && input.accessMode !== "open") {
    throw new AdminInputError("INVALID_ACCESS_MODE", "Access mode is invalid");
  }
  if (typeof input.webRtcEnabled !== "boolean") {
    throw new AdminInputError("INVALID_WEBRTC_ENABLED", "WebRTC enabled value is invalid");
  }
  const webRtcUdpStart = input.webRtcUdpStart ?? current.webRtcUdpStart ?? DEFAULT_WEBRTC_UDP_PORT_RANGE[0];
  const webRtcUdpEnd = input.webRtcUdpEnd ?? current.webRtcUdpEnd ?? DEFAULT_WEBRTC_UDP_PORT_RANGE[1];
  if (!Number.isInteger(webRtcUdpStart) || webRtcUdpStart < WEBRTC_UDP_PORT_MIN || webRtcUdpStart > WEBRTC_UDP_PORT_MAX) {
    throw new AdminInputError("INVALID_WEBRTC_PORT_RANGE", "WebRTC UDP start port must be between 1024 and 65535");
  }
  if (!Number.isInteger(webRtcUdpEnd) || webRtcUdpEnd < WEBRTC_UDP_PORT_MIN || webRtcUdpEnd > WEBRTC_UDP_PORT_MAX) {
    throw new AdminInputError("INVALID_WEBRTC_PORT_RANGE", "WebRTC UDP end port must be between 1024 and 65535");
  }
  if (webRtcUdpStart > webRtcUdpEnd) {
    throw new AdminInputError("INVALID_WEBRTC_PORT_RANGE", "WebRTC UDP start port must not exceed the end port");
  }
  if (current.webRtcEnabled && (webRtcUdpStart !== current.webRtcUdpStart || webRtcUdpEnd !== current.webRtcUdpEnd)) {
    throw new AdminInputError("WEBRTC_PORT_LOCKED", "Disable WebRTC and save before changing its UDP port range");
  }

  const identityMintMaxLevel = boundedInteger(
    input.identityMintMaxLevel ?? current.identityMintMaxLevel ?? DEFAULT_IDENTITY_MINT_POLICY.maxLevel,
    IDENTITY_MINT_LEVEL_MIN,
    IDENTITY_MINT_LEVEL_MAX,
    "INVALID_IDENTITY_MINT_LEVEL",
    `Identity mint max level must be between ${IDENTITY_MINT_LEVEL_MIN} and ${IDENTITY_MINT_LEVEL_MAX}`,
  );
  const identityMintConcurrency = boundedInteger(
    input.identityMintConcurrency ?? current.identityMintConcurrency ?? DEFAULT_IDENTITY_MINT_POLICY.concurrency,
    IDENTITY_MINT_CONCURRENCY_MIN,
    IDENTITY_MINT_CONCURRENCY_MAX,
    "INVALID_IDENTITY_MINT_CONCURRENCY",
    `Identity mint concurrency must be between ${IDENTITY_MINT_CONCURRENCY_MIN} and ${IDENTITY_MINT_CONCURRENCY_MAX}`,
  );
  const identityMintQueueDepth = boundedInteger(
    input.identityMintQueueDepth ?? current.identityMintQueueDepth ?? DEFAULT_IDENTITY_MINT_POLICY.queueDepth,
    IDENTITY_MINT_QUEUE_DEPTH_MIN,
    IDENTITY_MINT_QUEUE_DEPTH_MAX,
    "INVALID_IDENTITY_MINT_QUEUE_DEPTH",
    `Identity mint queue depth must be between ${IDENTITY_MINT_QUEUE_DEPTH_MIN} and ${IDENTITY_MINT_QUEUE_DEPTH_MAX}`,
  );
  const retention = {
    eventLog: {
      days: boundedInteger(
        input.eventLogRetentionDays ?? current.retention.eventLog.days ?? DEFAULT_RETENTION_POLICY.eventLog.days,
        RETENTION_DAYS_MIN,
        RETENTION_DAYS_MAX,
        "INVALID_EVENT_LOG_RETENTION",
        `Event log retention must be between ${RETENTION_DAYS_MIN} and ${RETENTION_DAYS_MAX} days`,
      ),
      maxRows: boundedInteger(
        input.eventLogMaxRows ?? current.retention.eventLog.maxRows ?? DEFAULT_RETENTION_POLICY.eventLog.maxRows,
        EVENT_LOG_ROWS_MIN,
        EVENT_LOG_ROWS_MAX,
        "INVALID_EVENT_LOG_ROWS",
        `Event log size must be between ${EVENT_LOG_ROWS_MIN} and ${EVENT_LOG_ROWS_MAX} entries`,
      ),
    },
    connections: {
      days: boundedInteger(
        input.connectionRetentionDays ?? current.retention.connections.days ?? DEFAULT_RETENTION_POLICY.connections.days,
        RETENTION_DAYS_MIN,
        RETENTION_DAYS_MAX,
        "INVALID_CONNECTION_RETENTION",
        `Connection history retention must be between ${RETENTION_DAYS_MIN} and ${RETENTION_DAYS_MAX} days`,
      ),
      maxRows: boundedInteger(
        input.connectionMaxRows ?? current.retention.connections.maxRows ?? DEFAULT_RETENTION_POLICY.connections.maxRows,
        CONNECTION_ROWS_MIN,
        CONNECTION_ROWS_MAX,
        "INVALID_CONNECTION_ROWS",
        `Connection history size must be between ${CONNECTION_ROWS_MIN} and ${CONNECTION_ROWS_MAX} entries`,
      ),
    },
  };

  return {
    siteName,
    welcomeTexts,
    accessMode: input.accessMode,
    webRtcEnabled: input.webRtcEnabled,
    webRtcUdpStart,
    webRtcUdpEnd,
    identityMintMaxLevel,
    identityMintConcurrency,
    identityMintQueueDepth,
    retention,
  };
}

export function normalizeRelayNodes(inputs: RelayNodeInput[], existing: PersistedRelayNode[], masterSecret: Buffer): PersistedRelayNode[] {
  if (!Array.isArray(inputs) || inputs.length > 16)
    throw new AdminInputError("INVALID_RELAY_NODES", "At most 16 relay nodes may be configured");
  const current = new Map(existing.map((node) => [node.id, node]));
  const seen = new Set<string>();
  const now = new Date().toISOString();
  return inputs.map((input) => {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    const targetText = typeof input.target === "string" ? input.target.trim() : "";
    if (!name || name.length > 80) throw new AdminInputError("INVALID_RELAY_NAME", "Relay name must contain 1 to 80 characters");
    if (!targetText || targetText.length > 300) throw new AdminInputError("INVALID_RELAY_TARGET", "Relay target is invalid");
    let target: TeamSpeakTarget;
    try {
      target = parseTeamSpeakTarget(targetText, DEFAULT_ACCELERATION_RELAY_PORT);
    } catch {
      throw new AdminInputError("INVALID_RELAY_TARGET", "Relay target is invalid");
    }
    const id =
      typeof input.id === "string" && /^relay-[a-z0-9-]{1,100}$/i.test(input.id) ? input.id : `relay-${randomBytes(8).toString("hex")}`;
    if (seen.has(id)) throw new AdminInputError("INVALID_RELAY_ID", "Relay id must be unique");
    seen.add(id);
    const previous = current.get(id);
    const tokenAction = input.tokenAction ?? (input.token === undefined ? "keep" : "replace");
    let tokenEncrypted = previous?.tokenEncrypted ?? null;
    if (tokenAction === "remove") tokenEncrypted = null;
    if (tokenAction === "replace") {
      const token = typeof input.token === "string" ? input.token.trim() : "";
      tokenEncrypted = token ? encryptSecret(token, masterSecret) : null;
    }
    if (input.enabled === true && (!tokenEncrypted || !canDecryptToken(tokenEncrypted, masterSecret))) {
      throw new AdminInputError("INVALID_RELAY_TOKEN", "A relay token of at least 16 characters is required when the relay is enabled");
    }
    return {
      id,
      name,
      enabled: input.enabled === true,
      host: target.host,
      port: target.port,
      tokenEncrypted,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
  });
}

function canDecryptToken(encrypted: string, masterSecret: Buffer): boolean {
  try {
    return decryptSecret(encrypted, masterSecret).length >= 16;
  } catch {
    return false;
  }
}

export function toSettingsUpdate(settings: StoredSettings): SettingsUpdate {
  return {
    siteName: settings.siteName,
    welcomeTexts: settings.welcomeTexts,
    accessMode: settings.accessMode,
    webRtcEnabled: settings.webRtcEnabled,
    webRtcUdpStart: settings.webRtcUdpStart,
    webRtcUdpEnd: settings.webRtcUdpEnd,
    identityMintMaxLevel: settings.identityMintMaxLevel,
    identityMintConcurrency: settings.identityMintConcurrency,
    identityMintQueueDepth: settings.identityMintQueueDepth,
    retention: settings.retention,
  };
}

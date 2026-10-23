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
import { AdminInputError } from "./adminErrors.js";

const DEFAULT_RELAY_NAME = "Relay acceleration";

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
  relaySettingsAction?: "keep" | "replace" | "remove";
  relayEnabled?: boolean;
  relayName?: string;
  relayTarget?: string;
  relayToken?: string;
  relayTokenAction?: "keep" | "replace" | "remove";
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

export function normalizeSettings(
  input: AdminSettingsInput,
  current: StoredSettings,
  masterSecret: Buffer,
  relayNodes?: PersistedRelayNode[],
): SettingsUpdate {
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

  let relayConfigured = current.relayConfigured;
  let relayEnabled = current.relayEnabled;
  let relayName = current.relayName;
  let relayHost = current.relayHost;
  let relayPort = current.relayPort || DEFAULT_ACCELERATION_RELAY_PORT;
  let relayTokenEncrypted = current.relayTokenEncrypted;
  const relaySettingsAction = input.relaySettingsAction ?? "keep";
  if (relaySettingsAction === "remove") {
    relayConfigured = true;
    relayEnabled = false;
    relayName = "";
    relayHost = "";
    relayPort = DEFAULT_ACCELERATION_RELAY_PORT;
    relayTokenEncrypted = null;
  } else if (relaySettingsAction === "replace") {
    const relayTarget = (input.relayTarget ?? "").trim();
    relayEnabled = input.relayEnabled === true;
    relayName = (input.relayName ?? "").trim();
    if (relayName.length > 80) throw new AdminInputError("INVALID_RELAY_NAME", "Relay name must contain 80 characters or fewer");
    if (relayEnabled && !relayName) throw new AdminInputError("INVALID_RELAY_NAME", "Relay name is required when the relay is enabled");
    if (relayEnabled && !relayTarget)
      throw new AdminInputError("INVALID_RELAY_TARGET", "Relay target is required when the relay is enabled");
    if (relayTarget) {
      try {
        const relay = parseTeamSpeakTarget(relayTarget, DEFAULT_ACCELERATION_RELAY_PORT);
        relayHost = relay.host;
        relayPort = relay.port;
      } catch {
        throw new AdminInputError("INVALID_RELAY_TARGET", "Relay target is invalid");
      }
    } else {
      relayHost = "";
      relayPort = DEFAULT_ACCELERATION_RELAY_PORT;
    }
    const relayTokenAction = input.relayTokenAction ?? (input.relayToken === undefined ? "keep" : "replace");
    if (relayTokenAction === "remove") relayTokenEncrypted = null;
    if (relayTokenAction === "replace") relayTokenEncrypted = input.relayToken ? encryptSecret(input.relayToken, masterSecret) : null;
    if (relayEnabled && !relayTokenEncrypted)
      throw new AdminInputError("INVALID_RELAY_TOKEN", "Relay token is required when the relay is enabled");
    relayConfigured = true;
  }
  if (relayNodes) {
    const primary = relayNodes.find((node) => node.enabled) ?? relayNodes[0];
    relayConfigured = relayNodes.length > 0;
    relayEnabled = primary?.enabled === true;
    relayName = primary?.name ?? "";
    relayHost = primary?.host ?? "";
    relayPort = primary?.port ?? DEFAULT_ACCELERATION_RELAY_PORT;
    relayTokenEncrypted = primary?.tokenEncrypted ?? null;
  }
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
    relayConfigured,
    relayEnabled,
    relayName,
    relayHost,
    relayPort,
    relayTokenEncrypted,
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

export function legacyRelayNodesFromSettings(settings: SettingsUpdate, existing: PersistedRelayNode[]): PersistedRelayNode[] {
  if (!settings.relayConfigured || !settings.relayHost || !settings.relayTokenEncrypted) return [];
  const previous = existing[0];
  const now = new Date().toISOString();
  return [
    {
      id: previous?.id ?? "relay-default",
      name: settings.relayName || DEFAULT_RELAY_NAME,
      enabled: settings.relayEnabled,
      host: settings.relayHost,
      port: settings.relayPort || DEFAULT_ACCELERATION_RELAY_PORT,
      tokenEncrypted: settings.relayTokenEncrypted,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    },
  ];
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
    relayConfigured: settings.relayConfigured,
    relayEnabled: settings.relayEnabled,
    relayName: settings.relayName,
    relayHost: settings.relayHost,
    relayPort: settings.relayPort,
    relayTokenEncrypted: settings.relayTokenEncrypted,
  };
}

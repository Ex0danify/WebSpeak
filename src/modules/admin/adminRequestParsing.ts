import { AdminInputError, type AdminSettingsInput, type RelayNodeInput } from "./adminService.js";
import type { ServerInput } from "./adminServerService.js";
import { WELCOME_LANGUAGE_MAX } from "./adminSettingsNormalizer.js";

export function readSettingsInput(body: Record<string, unknown>): AdminSettingsInput {
  const relayNodes = Array.isArray(body.relayNodes)
    ? body.relayNodes.map((value): RelayNodeInput => {
        const node = asRecord(value);
        return {
          id: typeof node.id === "string" ? node.id.slice(0, 110) : undefined,
          name: typeof node.name === "string" ? node.name.slice(0, 80) : "",
          target: typeof node.target === "string" ? node.target.slice(0, 300) : "",
          enabled: node.enabled === true,
          token: typeof node.token === "string" ? node.token.slice(0, 512) : undefined,
          tokenAction: readPasswordAction(node.tokenAction),
        };
      })
    : undefined;
  return {
    accessMode: body.accessMode === "open" ? "open" : body.accessMode === "fixed" ? "fixed" : (body.accessMode as never),
    siteName: readString(body, "siteName", 80),
    welcomeTexts: readWelcomeTexts(body.welcomeTexts),
    webRtcEnabled: body.webRtcEnabled === true,
    webRtcUdpStart: readOptionalInteger(body, "webRtcUdpStart"),
    webRtcUdpEnd: readOptionalInteger(body, "webRtcUdpEnd"),
    identityMintMaxLevel: readOptionalInteger(body, "identityMintMaxLevel"),
    identityMintConcurrency: readOptionalInteger(body, "identityMintConcurrency"),
    identityMintQueueDepth: readOptionalInteger(body, "identityMintQueueDepth"),
    relaySettingsAction: readRelaySettingsAction(body.relaySettingsAction),
    relayEnabled: body.relayEnabled === true,
    relayName: typeof body.relayName === "string" ? body.relayName.slice(0, 80) : undefined,
    relayTarget: typeof body.relayTarget === "string" ? body.relayTarget.slice(0, 300) : undefined,
    relayToken: typeof body.relayToken === "string" ? body.relayToken.slice(0, 512) : undefined,
    relayTokenAction: readPasswordAction(body.relayTokenAction),
    relayNodes,
  };
}

export function readServerInput(body: Record<string, unknown>): ServerInput {
  return {
    name: readString(body, "name", 80),
    target: readString(body, "target", 300),
    serverPassword: typeof body.serverPassword === "string" ? body.serverPassword.slice(0, 512) : undefined,
    passwordAction: readPasswordAction(body.passwordAction),
  };
}

function readRelaySettingsAction(value: unknown): "keep" | "replace" | "remove" {
  return value === "replace" || value === "remove" ? value : "keep";
}

function readPasswordAction(value: unknown): "keep" | "replace" | "remove" {
  return value === "replace" || value === "remove" ? value : "keep";
}

const WELCOME_LANGUAGE_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/** Welcome texts by language code, non-language keys and non-string values are dropped. */
function readWelcomeTexts(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const texts: Record<string, string> = {};
  for (const [language, text] of Object.entries(value).slice(0, WELCOME_LANGUAGE_MAX)) {
    if (WELCOME_LANGUAGE_PATTERN.test(language) && typeof text === "string") texts[language] = text.slice(0, 500);
  }
  return texts;
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AdminInputError("INVALID_REQUEST", "Request body is invalid");
  return value as Record<string, unknown>;
}

export function readString(body: Record<string, unknown>, key: string, max: number): string {
  if (typeof body[key] !== "string" || body[key].length > max) throw new AdminInputError("INVALID_REQUEST", `${key} is invalid`);
  return body[key];
}

function readOptionalInteger(body: Record<string, unknown>, key: string): number | undefined {
  if (body[key] === undefined) return undefined;
  if (typeof body[key] !== "number" || !Number.isSafeInteger(body[key])) {
    throw new AdminInputError("INVALID_REQUEST", `${key} is invalid`);
  }
  return body[key];
}

export function readOptionalString(body: Record<string, unknown>, key: string, max: number): string {
  return typeof body[key] === "string" ? body[key].slice(0, max) : "";
}

export function readOptionalNumber(body: Record<string, unknown>, key: string, fallback: number): number {
  return body[key] === undefined ? fallback : typeof body[key] === "number" ? body[key] : Number.NaN;
}

export function readLimit(value: unknown, fallback: number): number {
  const limit = typeof value === "string" ? Number(value) : fallback;
  return Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : fallback;
}

import { AdminInputError, type AdminSettingsInput, type RelayNodeInput } from "./adminService.js";

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
    target: readString(body, "target", 300),
    serverPassword: typeof body.serverPassword === "string" ? body.serverPassword.slice(0, 512) : undefined,
    passwordAction: readPasswordAction(body.passwordAction),
    accessMode: body.accessMode === "open" ? "open" : body.accessMode === "fixed" ? "fixed" : body.accessMode as never,
    siteName: readString(body, "siteName", 80),
    welcomeText: readOptionalString(body, "welcomeText", 500),
    welcomeTextEn: typeof body.welcomeTextEn === "string" ? body.welcomeTextEn.slice(0, 500) : undefined,
    welcomeTextDe: typeof body.welcomeTextDe === "string" ? body.welcomeTextDe.slice(0, 500) : undefined,
    welcomeTextRu: typeof body.welcomeTextRu === "string" ? body.welcomeTextRu.slice(0, 500) : undefined,
    welcomeTextJa: typeof body.welcomeTextJa === "string" ? body.welcomeTextJa.slice(0, 500) : undefined,
    webRtcEnabled: body.webRtcEnabled === true,
    webRtcUdpStart: readOptionalInteger(body, "webRtcUdpStart"),
    webRtcUdpEnd: readOptionalInteger(body, "webRtcUdpEnd"),
    relaySettingsAction: readRelaySettingsAction(body.relaySettingsAction),
    relayEnabled: body.relayEnabled === true,
    relayName: typeof body.relayName === "string" ? body.relayName.slice(0, 80) : undefined,
    relayTarget: typeof body.relayTarget === "string" ? body.relayTarget.slice(0, 300) : undefined,
    relayToken: typeof body.relayToken === "string" ? body.relayToken.slice(0, 512) : undefined,
    relayTokenAction: readPasswordAction(body.relayTokenAction),
    relayNodes,
  };
}

function readRelaySettingsAction(value: unknown): "keep" | "replace" | "remove" {
  return value === "replace" || value === "remove" ? value : "keep";
}

function readPasswordAction(value: unknown): "keep" | "replace" | "remove" {
  return value === "replace" || value === "remove" ? value : "keep";
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

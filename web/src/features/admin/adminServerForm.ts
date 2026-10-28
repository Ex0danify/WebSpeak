import { LANGUAGES, type Language } from "@/shared/i18n/languages.js";
import { randomHex } from "@/shared/lib/randomId";

export type AccessMode = "fixed" | "open";
export interface HostPing {
  ok: boolean;
  latencyMs: number | null;
  packetLossPercent: number;
  attempts: number;
  successfulAttempts: number;
  errorCode?: string;
}
export interface ProbeState {
  ok: boolean;
  latencyMs?: number | null;
  hostPing?: HostPing;
  code?: string;
  errorCode?: string;
}
export interface RelayNodeForm {
  id: string;
  name: string;
  enabled: boolean;
  target: string;
  token: string;
  tokenAction: "keep" | "replace" | "remove";
  hasToken: boolean;
}
export type WelcomeLanguage = Language;

export const DEFAULT_WELCOME_TEXTS: Record<string, string> = {
  en: "No TeamSpeak client installation required. Open your browser and join a voice channel with low-latency audio built for conversation.",
  de: "Keine Installation des TeamSpeak-Clients nötig. Öffne den Browser und tritt einem Sprachkanal bei – leichtgewichtig und mit geringer Latenz.",
};

/** The add and edit dialog of the server list. An empty id means a new server. */
export function initialServerDialog() {
  return {
    open: false,
    id: "",
    name: "",
    address: "",
    port: "9987",
    serverPassword: "",
    passwordAction: "replace" as "keep" | "replace" | "remove",
    hasPassword: false,
    saving: false,
    error: "",
  };
}

/** One option per discovered language, so adding a language file adds it to the admin form. */
export const welcomeLanguageOptions: Array<{ value: WelcomeLanguage; label: string }> = LANGUAGES.map((info) => ({
  value: info.code,
  label: info.endonym,
}));

export function mapWelcomeTexts(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

export function mapRelayNodes(value: unknown): RelayNodeForm[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const node = item as { id?: unknown; name?: unknown; enabled?: unknown; target?: unknown; hasToken?: unknown };
    if (typeof node.id !== "string" || typeof node.name !== "string" || typeof node.target !== "string") return [];
    return [
      {
        id: node.id,
        name: node.name,
        enabled: node.enabled === true,
        target: node.target,
        token: "",
        tokenAction: "keep" as const,
        hasToken: node.hasToken === true,
      },
    ];
  });
}

export function createRelayNode(): RelayNodeForm {
  return {
    id: `relay-new-${Date.now().toString(36)}-${randomHex()}`,
    name: "",
    enabled: false,
    target: "",
    token: "",
    tokenAction: "replace",
    hasToken: false,
  };
}

export function initialServerForm() {
  return {
    accessMode: "fixed" as AccessMode,
    siteName: "WebSpeak",
    welcomeTexts: {} as Record<string, string>,
    welcomeDefaults: { ...DEFAULT_WELCOME_TEXTS },
    webRtcEnabled: false,
    webRtcUdpStart: 40000,
    webRtcUdpEnd: 40099,
    identityMintMaxLevel: 8,
    identityMintConcurrency: 2,
    identityMintQueueDepth: 20,
    relayConfigured: false,
    relayEnabled: false,
    relayName: "",
    relayTarget: "",
    relayToken: "",
    relayTokenAction: "keep" as "keep" | "replace" | "remove",
    hasRelayToken: false,
    relaySettingsTouched: false,
    relayNodes: [] as RelayNodeForm[],
    internalPort: null as number | null,
  };
}

/** The form fields a settings response (from GET or from the PUT that saved it) sets, secrets cleared and touched flags reset. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- admin JSON bodies are read field by field, the gateway owns their shape
export function formFieldsFromSettings(value: Record<string, any>) {
  return {
    welcomeTexts: mapWelcomeTexts(value.welcomeTexts),
    welcomeDefaults: {
      ...DEFAULT_WELCOME_TEXTS,
      ...(value.welcomeDefaults && typeof value.welcomeDefaults === "object" ? value.welcomeDefaults : {}),
    },
    webRtcEnabled: value.webRtcEnabled === true,
    webRtcUdpStart: Number(value.webRtcUdpStart || 40000),
    webRtcUdpEnd: Number(value.webRtcUdpEnd || 40099),
    identityMintMaxLevel: Number(value.identityMintMaxLevel || 8),
    identityMintConcurrency: Number(value.identityMintConcurrency || 2),
    identityMintQueueDepth: Number(value.identityMintQueueDepth ?? 20),
    relayConfigured: value.relayConfigured === true,
    relayEnabled: value.relayEnabled === true,
    relayName: String(value.relayName || ""),
    relayTarget: String(value.relayTarget || ""),
    relayToken: "",
    relayTokenAction: "keep",
    hasRelayToken: value.hasRelayToken === true,
    relaySettingsTouched: false,
    relayNodes: mapRelayNodes(value.relayNodes),
  };
}

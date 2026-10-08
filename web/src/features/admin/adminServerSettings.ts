import type { MessageKey } from "@/shared/i18n/messageKeys";
import { computed, reactive, ref, watch } from "vue";
import { defineStore } from "pinia";
import type { ApiError } from "./adminApi.js";
import { createAdminFormat } from "./adminFormat.js";
import { combineTeamSpeakTarget, splitTeamSpeakTarget } from "@/shared/lib/teamspeakTarget.js";
import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from "@/shared/i18n/languages.js";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { useAdminOverviewStore } from "./adminOverview.js";
import { useAdminSessionStore } from "./adminSession.js";

export type AccessMode = "fixed" | "open";
export interface HostPing { ok: boolean; latencyMs: number | null; packetLossPercent: number; attempts: number; successfulAttempts: number; errorCode?: string }
export interface ProbeState { ok: boolean; latencyMs?: number | null; hostPing?: HostPing; code?: string; errorCode?: string }
export interface RelayNodeForm { id: string; name: string; enabled: boolean; target: string; token: string; tokenAction: "keep" | "replace" | "remove"; hasToken: boolean }
export type WelcomeLanguage = Language;

export const DEFAULT_WELCOME_TEXTS: Record<string, string> = {
  en: "No TeamSpeak client installation required. Open your browser and join a voice channel with low-latency audio built for conversation.",
  de: "Keine Installation des TeamSpeak-Clients nötig. Öffne den Browser und tritt einem Sprachkanal bei – leichtgewichtig und mit geringer Latenz.",
};

/** One option per discovered language, so adding a language file adds it to the admin form. */
export const welcomeLanguageOptions: Array<{ value: WelcomeLanguage; label: string }> = LANGUAGES.map((info) => ({ value: info.code, label: info.endonym }));

function mapWelcomeTexts(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

export function mapRelayNodes(value: unknown): RelayNodeForm[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const node = item as { id?: unknown; name?: unknown; enabled?: unknown; target?: unknown; hasToken?: unknown };
    if (typeof node.id !== "string" || typeof node.name !== "string" || typeof node.target !== "string") return [];
    return [{ id: node.id, name: node.name, enabled: node.enabled === true, target: node.target, token: "", tokenAction: "keep" as const, hasToken: node.hasToken === true }];
  });
}

export function createRelayNode(): RelayNodeForm {
  return { id: `relay-new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, name: "", enabled: false, target: "", token: "", tokenAction: "replace", hasToken: false };
}

function initialServerForm() {
  return { address: "", port: "9987", serverPassword: "", passwordAction: "keep" as "keep" | "replace" | "remove", hasPassword: false, accessMode: "fixed" as AccessMode, siteName: "WebSpeak", welcomeTexts: {} as Record<string, string>, welcomeDefaults: { ...DEFAULT_WELCOME_TEXTS }, webRtcEnabled: false, webRtcUdpStart: 40000, webRtcUdpEnd: 40099, relayConfigured: false, relayEnabled: false, relayName: "", relayTarget: "", relayToken: "", relayTokenAction: "keep" as "keep" | "replace" | "remove", hasRelayToken: false, relaySettingsTouched: false, relayNodes: [] as RelayNodeForm[], lastTestAt: null as string | null, lastTestLatencyMs: null as number | null };
}

/** The server page's state: the TeamSpeak target, access mode, welcome texts, WebRTC port range and
 *  relay nodes, plus loading, saving and the connection test. */
export const useAdminServerSettingsStore = defineStore("adminServerSettings", () => {
  const admin = useAdminSessionStore();
  const { language, t } = useI18n();
  const { connectionFailureText } = createAdminFormat(language, t);

  const testing = ref(false);
  const testResult = ref<ProbeState | null>(null);
  const webrtcPortNoticeOpen = ref(false);
  const serverForm = reactive(initialServerForm());
  const welcomeLanguage = ref<WelcomeLanguage>(DEFAULT_LANGUAGE);

  const selectedWelcomeText = computed<string>({
    get: () => serverForm.welcomeTexts[welcomeLanguage.value] ?? "",
    set: (value: string) => { serverForm.welcomeTexts = { ...serverForm.welcomeTexts, [welcomeLanguage.value]: value }; },
  });
  const selectedWelcomeLanguageLabel = computed(() => welcomeLanguageOptions.find((option) => option.value === welcomeLanguage.value)?.label ?? "");
  const selectedWelcomeDefault = computed(() => serverForm.welcomeDefaults[welcomeLanguage.value] || serverForm.welcomeDefaults[DEFAULT_LANGUAGE] || DEFAULT_WELCOME_TEXTS[DEFAULT_LANGUAGE]!);
  const webrtcPortRangeText = computed(() => `${serverForm.webRtcUdpStart}–${serverForm.webRtcUdpEnd}`);

  const testResultTitle = computed(() => {
    const result = testResult.value;
    if (!result) return "";
    if (result.ok) return t("serverAnswered");
    const names: Record<string, MessageKey> = {
      INVALID_TARGET: "serverAddress",
      INVALID_NICKNAME: "invalidNicknameError",
      HOST_NOT_FOUND: "hostNotFoundError",
      UNREACHABLE: "networkUnreachableError",
      CONNECTION_REFUSED: "connectionRefusedError",
      CONNECTION_RESET: "connectionResetError",
      TIMEOUT: "networkTimeoutError",
      PASSWORD_REQUIRED: "serverPasswordRequiredError",
      INVALID_PASSWORD: "invalidServerPasswordError",
      PROTOCOL_NEGOTIATION_FAILED: "protocolFailureError",
      SERVER_REJECTED: "serverRejectedError",
      NO_ANSWER: "noAnswerError",
      PING_UNAVAILABLE: "pingUnavailableError",
    };
    return t(names[result.code ?? result.errorCode ?? ""] ?? "connectionFailed");
  });
  const testResultText = computed(() => {
    const result = testResult.value;
    if (!result) return "";
    const ping = result.hostPing;
    const hostPing = !ping || ping.errorCode === "PING_UNAVAILABLE" ? null : ping.ok ? `${t('hostPing')} ${ping.latencyMs} ms · ${t('packetLossRate')} ${ping.packetLossPercent}%` : t('hostPingNoAnswer');
    if (result.ok) return [t("serverAnsweredHint"), result.latencyMs == null ? null : `${result.latencyMs} ms`, hostPing].filter(Boolean).join(" · ");
    const code = result.code ?? result.errorCode;
    return [code === "NO_ANSWER" ? t("noAnswerHint") : connectionFailureText(code), hostPing].filter(Boolean).join(" · ");
  });

  watch(() => [serverForm.address, serverForm.port], () => { if (!testing.value && admin.screen === "admin") testResult.value = null; });

  /** Copies a settings response (from GET or from the PUT that saved it) into the form. */
  function applySettings(value: Record<string, any>) {
    const target = splitTeamSpeakTarget(value.target);
    Object.assign(serverForm, value, { address: target.address, port: target.port, serverPassword: "", passwordAction: "keep", welcomeTexts: mapWelcomeTexts(value.welcomeTexts), welcomeDefaults: { ...DEFAULT_WELCOME_TEXTS, ...(value.welcomeDefaults && typeof value.welcomeDefaults === "object" ? value.welcomeDefaults : {}) }, webRtcEnabled: value.webRtcEnabled === true, webRtcUdpStart: Number(value.webRtcUdpStart || 40000), webRtcUdpEnd: Number(value.webRtcUdpEnd || 40099), relayConfigured: value.relayConfigured === true, relayEnabled: value.relayEnabled === true, relayName: String(value.relayName || ""), relayTarget: String(value.relayTarget || ""), relayToken: "", relayTokenAction: "keep", hasRelayToken: value.hasRelayToken === true, relaySettingsTouched: false, relayNodes: mapRelayNodes(value.relayNodes) });
  }

  function addRelayNode() { serverForm.relayNodes.push(createRelayNode()); serverForm.relaySettingsTouched = true; }
  function removeRelayNode(index: number) { serverForm.relayNodes.splice(index, 1); serverForm.relaySettingsTouched = true; }

  async function loadServerSettings() { applySettings(await admin.getJson("/api/admin/server")); }

  function serverPayload() {
    return { target: combineTeamSpeakTarget(serverForm.address, serverForm.port), serverPassword: serverForm.passwordAction === "replace" ? serverForm.serverPassword : undefined, passwordAction: serverForm.passwordAction, accessMode: serverForm.accessMode, siteName: serverForm.siteName, welcomeTexts: serverForm.welcomeTexts, webRtcEnabled: serverForm.webRtcEnabled, webRtcUdpStart: serverForm.webRtcUdpStart, webRtcUdpEnd: serverForm.webRtcUdpEnd, relayNodes: serverForm.relayNodes.map((node) => ({ id: node.id, name: node.name, target: node.target, enabled: node.enabled, tokenAction: node.tokenAction, ...(node.tokenAction === "replace" ? { token: node.token } : {}) })) };
  }

  async function saveServerSettings() {
    admin.submitting = true;
    admin.errorMessage = "";
    try {
      const result = await admin.sendJson("/api/admin/server", "PUT", serverPayload());
      applySettings(result.settings);
      await useAdminOverviewStore().loadOverview();
      admin.notify(t('settingsSaved'));
    } catch (error) {
      admin.errorMessage = admin.errorText((error as ApiError).code);
    } finally {
      admin.submitting = false;
    }
  }

  function handleWebRtcToggle() { if (serverForm.webRtcEnabled) webrtcPortNoticeOpen.value = true; }

  async function runTest(url: string, body: Record<string, unknown>) {
    testing.value = true;
    admin.errorMessage = "";
    testResult.value = null;
    try {
      testResult.value = await admin.sendJson(url, "POST", body, url.includes("/server/test"));
    } catch (error) {
      testResult.value = { ok: false, code: (error as ApiError).code };
    } finally {
      testing.value = false;
    }
  }

  async function testServerConnection() {
    await runTest("/api/admin/server/test", { target: combineTeamSpeakTarget(serverForm.address, serverForm.port) });
    if (testResult.value) {
      await useAdminOverviewStore().loadOverview();
      serverForm.lastTestAt = new Date().toISOString();
      serverForm.lastTestLatencyMs = testResult.value.ok ? (testResult.value.latencyMs ?? null) : null;
    }
  }

  /** Back to the empty form, for logout: setup stores have no `$reset`. */
  function reset() {
    Object.assign(serverForm, initialServerForm());
    welcomeLanguage.value = "en";
    testResult.value = null;
    testing.value = false;
    webrtcPortNoticeOpen.value = false;
  }

  return { serverForm, welcomeLanguage, selectedWelcomeText, selectedWelcomeLanguageLabel, selectedWelcomeDefault, webrtcPortNoticeOpen, webrtcPortRangeText, testing, testResult, testResultTitle, testResultText, loadServerSettings, saveServerSettings, testServerConnection, addRelayNode, removeRelayNode, handleWebRtcToggle, reset };
});

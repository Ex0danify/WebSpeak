import { computed, reactive, ref, watch } from "vue";
import { defineStore } from "pinia";
import type { ApiError } from "../lib/admin-api.js";
import { createAdminFormat } from "../lib/admin-format.js";
import { combineTeamSpeakTarget, splitTeamSpeakTarget } from "../services/teamspeak-target.js";
import { useI18n } from "../i18n/use-i18n.js";
import { useAdminOverviewStore } from "./adminOverview.js";
import { useAdminSessionStore } from "./adminSession.js";

export type AccessMode = "fixed" | "open";
export interface HostPing { ok: boolean; latencyMs: number | null; packetLossPercent: number; attempts: number; successfulAttempts: number; errorCode?: string }
export interface ProbeState { ok: boolean; latencyMs?: number | null; hostPing?: HostPing; code?: string; errorCode?: string }
export interface RelayNodeForm { id: string; name: string; enabled: boolean; target: string; token: string; tokenAction: "keep" | "replace" | "remove"; hasToken: boolean }
export type WelcomeLanguage = "zh" | "en" | "de" | "ru" | "ja";
type WelcomeTextField = "welcomeText" | "welcomeTextEn" | "welcomeTextDe" | "welcomeTextRu" | "welcomeTextJa";

export const DEFAULT_WELCOME_TEXTS: Record<WelcomeLanguage, string> = {
  zh: "无需安装 TeamSpeak 客户端，打开浏览器即可加入语音频道。低延迟、轻量、专注于每一次对话。",
  en: "No TeamSpeak client installation required. Open your browser and join a voice channel with low-latency audio built for conversation.",
  de: "Keine Installation des TeamSpeak-Clients nötig. Öffne den Browser und tritt einem Sprachkanal bei – leichtgewichtig und mit geringer Latenz.",
  ru: "Устанавливать клиент TeamSpeak не нужно: откройте браузер и присоединитесь к голосовому каналу. Низкая задержка и удобное общение в каждом разговоре.",
  ja: "TeamSpeak クライアントのインストールは不要です。ブラウザを開くだけで音声チャンネルに参加できます。低遅延で軽快な会話を楽しめます。",
};

export const welcomeLanguageOptions: Array<{ value: WelcomeLanguage; label: string }> = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "ru", label: "Русский" },
  { value: "ja", label: "日本語" },
];

const welcomeTextFieldByLanguage: Record<WelcomeLanguage, WelcomeTextField> = {
  zh: "welcomeText",
  en: "welcomeTextEn",
  de: "welcomeTextDe",
  ru: "welcomeTextRu",
  ja: "welcomeTextJa",
};

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
  return { address: "", port: "9987", serverPassword: "", passwordAction: "keep" as "keep" | "replace" | "remove", hasPassword: false, accessMode: "fixed" as AccessMode, siteName: "WebSpeak", welcomeText: "", welcomeTextEn: "", welcomeTextDe: "", welcomeTextRu: "", welcomeTextJa: "", welcomeDefaults: { ...DEFAULT_WELCOME_TEXTS }, webRtcEnabled: false, webRtcUdpStart: 40000, webRtcUdpEnd: 40099, relayConfigured: false, relayEnabled: false, relayName: "", relayTarget: "", relayToken: "", relayTokenAction: "keep" as "keep" | "replace" | "remove", hasRelayToken: false, relaySettingsTouched: false, relayNodes: [] as RelayNodeForm[], lastTestAt: null as string | null, lastTestLatencyMs: null as number | null };
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
  const welcomeLanguage = ref<WelcomeLanguage>("zh");

  const selectedWelcomeText = computed<string>({
    get: () => serverForm[welcomeTextFieldByLanguage[welcomeLanguage.value]],
    set: (value: string) => { serverForm[welcomeTextFieldByLanguage[welcomeLanguage.value]] = value; },
  });
  const selectedWelcomeLanguageLabel = computed(() => welcomeLanguageOptions.find((option) => option.value === welcomeLanguage.value)?.label ?? "");
  const selectedWelcomeDefault = computed(() => serverForm.welcomeDefaults[welcomeLanguage.value] || DEFAULT_WELCOME_TEXTS[welcomeLanguage.value]);
  const webrtcPortRangeText = computed(() => `${serverForm.webRtcUdpStart}–${serverForm.webRtcUdpEnd}`);

  const testResultTitle = computed(() => {
    const result = testResult.value;
    if (!result) return "";
    if (result.ok) return t("serverAnswered");
    const names: Record<string, string> = {
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
    Object.assign(serverForm, value, { address: target.address, port: target.port, serverPassword: "", passwordAction: "keep", welcomeTextDe: String(value.welcomeTextDe || ""), welcomeTextRu: String(value.welcomeTextRu || ""), welcomeTextJa: String(value.welcomeTextJa || ""), welcomeDefaults: { ...DEFAULT_WELCOME_TEXTS, ...(value.welcomeDefaults && typeof value.welcomeDefaults === "object" ? value.welcomeDefaults : {}) }, webRtcEnabled: value.webRtcEnabled === true, webRtcUdpStart: Number(value.webRtcUdpStart || 40000), webRtcUdpEnd: Number(value.webRtcUdpEnd || 40099), relayConfigured: value.relayConfigured === true, relayEnabled: value.relayEnabled === true, relayName: String(value.relayName || ""), relayTarget: String(value.relayTarget || ""), relayToken: "", relayTokenAction: "keep", hasRelayToken: value.hasRelayToken === true, relaySettingsTouched: false, relayNodes: mapRelayNodes(value.relayNodes) });
  }

  function addRelayNode() { serverForm.relayNodes.push(createRelayNode()); serverForm.relaySettingsTouched = true; }
  function removeRelayNode(index: number) { serverForm.relayNodes.splice(index, 1); serverForm.relaySettingsTouched = true; }

  async function loadServerSettings() { applySettings(await admin.getJson("/api/admin/server")); }

  function serverPayload() {
    return { target: combineTeamSpeakTarget(serverForm.address, serverForm.port), serverPassword: serverForm.passwordAction === "replace" ? serverForm.serverPassword : undefined, passwordAction: serverForm.passwordAction, accessMode: serverForm.accessMode, siteName: serverForm.siteName, welcomeText: serverForm.welcomeText, welcomeTextEn: serverForm.welcomeTextEn, welcomeTextDe: serverForm.welcomeTextDe, welcomeTextRu: serverForm.welcomeTextRu, welcomeTextJa: serverForm.welcomeTextJa, webRtcEnabled: serverForm.webRtcEnabled, webRtcUdpStart: serverForm.webRtcUdpStart, webRtcUdpEnd: serverForm.webRtcUdpEnd, relayNodes: serverForm.relayNodes.map((node) => ({ id: node.id, name: node.name, target: node.target, enabled: node.enabled, tokenAction: node.tokenAction, ...(node.tokenAction === "replace" ? { token: node.token } : {}) })) };
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
    welcomeLanguage.value = "zh";
    testResult.value = null;
    testing.value = false;
    webrtcPortNoticeOpen.value = false;
  }

  return { serverForm, welcomeLanguage, selectedWelcomeText, selectedWelcomeLanguageLabel, selectedWelcomeDefault, webrtcPortNoticeOpen, webrtcPortRangeText, testing, testResult, testResultTitle, testResultText, loadServerSettings, saveServerSettings, testServerConnection, addRelayNode, removeRelayNode, handleWebRtcToggle, reset };
});

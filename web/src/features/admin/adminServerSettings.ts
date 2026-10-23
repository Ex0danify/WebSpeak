import type { MessageKey } from "@/shared/i18n/messageKeys";
import { computed, reactive, ref, watch } from "vue";
import { defineStore } from "pinia";
import type { ApiError } from "@/features/admin/adminApi.js";
import { createAdminFormat } from "@/features/admin/adminFormat.js";
import { combineTeamSpeakTarget } from "@/shared/lib/teamspeakTarget.js";
import { DEFAULT_LANGUAGE } from "@/shared/i18n/languages.js";
import { useI18n } from "@/shared/i18n/useI18n.js";
import {
  createRelayNode,
  DEFAULT_WELCOME_TEXTS,
  formFieldsFromSettings,
  initialServerForm,
  type ProbeState,
  type WelcomeLanguage,
  welcomeLanguageOptions,
} from "@/features/admin/adminServerForm.js";
import { adminSiblings } from "@/features/admin/adminSiblings.js";
import { useAdminSessionStore } from "@/features/admin/adminSession.js";

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
    set: (value: string) => {
      serverForm.welcomeTexts = { ...serverForm.welcomeTexts, [welcomeLanguage.value]: value };
    },
  });
  const selectedWelcomeLanguageLabel = computed(
    () => welcomeLanguageOptions.find((option) => option.value === welcomeLanguage.value)?.label ?? "",
  );
  const selectedWelcomeDefault = computed(
    () =>
      serverForm.welcomeDefaults[welcomeLanguage.value] ||
      serverForm.welcomeDefaults[DEFAULT_LANGUAGE] ||
      DEFAULT_WELCOME_TEXTS[DEFAULT_LANGUAGE]!,
  );
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
    const hostPing =
      !ping || ping.errorCode === "PING_UNAVAILABLE"
        ? null
        : ping.ok
          ? `${t("hostPing")} ${ping.latencyMs} ms · ${t("packetLossRate")} ${ping.packetLossPercent}%`
          : t("hostPingNoAnswer");
    if (result.ok)
      return [t("serverAnsweredHint"), result.latencyMs == null ? null : `${result.latencyMs} ms`, hostPing].filter(Boolean).join(" · ");
    const code = result.code ?? result.errorCode;
    return [code === "NO_ANSWER" ? t("noAnswerHint") : connectionFailureText(code), hostPing].filter(Boolean).join(" · ");
  });

  watch(
    () => [serverForm.address, serverForm.port],
    () => {
      if (!testing.value && admin.screen === "admin") testResult.value = null;
    },
  );

  /** Copies a settings response (from GET or from the PUT that saved it) into the form. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- admin JSON bodies are read field by field, the gateway owns their shape
  function applySettings(value: Record<string, any>) {
    Object.assign(serverForm, value, formFieldsFromSettings(value));
  }

  function addRelayNode() {
    serverForm.relayNodes.push(createRelayNode());
    serverForm.relaySettingsTouched = true;
  }
  function removeRelayNode(index: number) {
    serverForm.relayNodes.splice(index, 1);
    serverForm.relaySettingsTouched = true;
  }

  async function loadServerSettings() {
    applySettings(await admin.getJson("/api/admin/server"));
  }

  function serverPayload() {
    return {
      target: combineTeamSpeakTarget(serverForm.address, serverForm.port),
      serverPassword: serverForm.passwordAction === "replace" ? serverForm.serverPassword : undefined,
      passwordAction: serverForm.passwordAction,
      accessMode: serverForm.accessMode,
      siteName: serverForm.siteName,
      welcomeTexts: serverForm.welcomeTexts,
      webRtcEnabled: serverForm.webRtcEnabled,
      webRtcUdpStart: serverForm.webRtcUdpStart,
      webRtcUdpEnd: serverForm.webRtcUdpEnd,
      identityMintMaxLevel: serverForm.identityMintMaxLevel,
      identityMintConcurrency: serverForm.identityMintConcurrency,
      identityMintQueueDepth: serverForm.identityMintQueueDepth,
      relayNodes: serverForm.relayNodes.map((node) => ({
        id: node.id,
        name: node.name,
        target: node.target,
        enabled: node.enabled,
        tokenAction: node.tokenAction,
        ...(node.tokenAction === "replace" ? { token: node.token } : {}),
      })),
    };
  }

  async function saveServerSettings() {
    admin.submitting = true;
    admin.errorMessage = "";
    try {
      const result = await admin.sendJson("/api/admin/server", "PUT", serverPayload());
      applySettings(result.settings);
      await adminSiblings().loadOverview();
      admin.notify(t("settingsSaved"));
    } catch (error) {
      admin.errorMessage = admin.errorText((error as ApiError).code);
    } finally {
      admin.submitting = false;
    }
  }

  function handleWebRtcToggle() {
    if (serverForm.webRtcEnabled) webrtcPortNoticeOpen.value = true;
  }

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
      await adminSiblings().loadOverview();
      serverForm.lastTestAt = new Date().toISOString();
      serverForm.lastTestLatencyMs = testResult.value.ok ? (testResult.value.latencyMs ?? null) : null;
    }
  }

  /** Back to the empty form for logout, setup stores have no `$reset`. */
  function reset() {
    Object.assign(serverForm, initialServerForm());
    welcomeLanguage.value = "en";
    testResult.value = null;
    testing.value = false;
    webrtcPortNoticeOpen.value = false;
  }

  return {
    serverForm,
    welcomeLanguage,
    selectedWelcomeText,
    selectedWelcomeLanguageLabel,
    selectedWelcomeDefault,
    webrtcPortNoticeOpen,
    webrtcPortRangeText,
    testing,
    testResult,
    testResultTitle,
    testResultText,
    loadServerSettings,
    saveServerSettings,
    testServerConnection,
    addRelayNode,
    removeRelayNode,
    handleWebRtcToggle,
    reset,
  };
});

import { computed, reactive, ref } from "vue";
import { defineStore } from "pinia";
import { DEFAULT_LANGUAGE } from "@/shared/i18n/languages.js";
import { useI18n } from "@/shared/i18n/useI18n.js";
import {
  createRelayNode,
  DEFAULT_WELCOME_TEXTS,
  formFieldsFromSettings,
  initialServerForm,
  type WelcomeLanguage,
  welcomeLanguageOptions,
} from "@/features/admin/adminServerForm.js";
import { useAdminFeedbackStore } from "@/features/admin/adminFeedback.js";
import { adminSiblings } from "@/features/admin/adminSiblings.js";
import { useAdminSessionStore } from "@/features/admin/adminSession.js";

/** The server page's settings: access mode, welcome texts, WebRTC port range and relay nodes, plus loading and saving. */
export const useAdminServerSettingsStore = defineStore("adminServerSettings", () => {
  const admin = useAdminSessionStore();
  const feedback = useAdminFeedbackStore();
  const { t } = useI18n();

  const savingSettings = ref(false);
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
    savingSettings.value = true;
    feedback.clearError();
    try {
      const result = await admin.sendJson("/api/admin/server", "PUT", serverPayload());
      applySettings(result.settings);
      await adminSiblings().loadOverview();
      feedback.notify(t("settingsSaved"));
    } catch (error) {
      feedback.fail(error);
    } finally {
      savingSettings.value = false;
    }
  }

  function handleWebRtcToggle() {
    if (serverForm.webRtcEnabled) webrtcPortNoticeOpen.value = true;
  }

  /** Back to the empty form for logout, setup stores have no `$reset`. */
  function reset() {
    Object.assign(serverForm, initialServerForm());
    welcomeLanguage.value = "en";
    webrtcPortNoticeOpen.value = false;
    savingSettings.value = false;
  }

  return {
    serverForm,
    savingSettings,
    welcomeLanguage,
    selectedWelcomeText,
    selectedWelcomeLanguageLabel,
    selectedWelcomeDefault,
    webrtcPortNoticeOpen,
    webrtcPortRangeText,
    loadServerSettings,
    saveServerSettings,
    addRelayNode,
    removeRelayNode,
    handleWebRtcToggle,
    reset,
  };
});

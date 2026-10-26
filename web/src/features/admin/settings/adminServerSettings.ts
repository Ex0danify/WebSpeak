import { computed, nextTick, reactive, ref } from "vue";
import { defineStore } from "pinia";
import { DEFAULT_LANGUAGE } from "@/shared/i18n/languages.js";
import { useI18n } from "@/shared/i18n/useI18n.js";
import {
  createRelayNode,
  DEFAULT_WELCOME_TEXTS,
  initialServerForm,
  serverFormFromSettings,
  type WelcomeLanguage,
  welcomeLanguageOptions,
} from "@/features/admin/settings/adminServerForm.js";
import {
  applySavedSettings,
  buildSettingsDocument,
  sameDocument,
  changedFieldKeys,
  type SettingsIssue,
  type SettingsIssues,
  type SettingsSection,
} from "@/features/admin/settings/adminServerDocument.js";
import { createSaveStatus, type SaveStatus } from "@/features/admin/core/saveStatus.js";
import type { ApiError } from "@/features/admin/core/adminApi.js";
import { useAdminFeedbackStore } from "@/features/admin/core/adminFeedback.js";
import { adminSiblings } from "@/features/admin/core/adminSiblings.js";
import { useAdminSessionStore } from "@/features/admin/core/adminSession.js";

const SECTIONS: SettingsSection[] = ["access", "advanced", "relay"];

/** The section a refused save is about, by the code the gateway answered with. */
function sectionOfError(code: string | undefined): SettingsSection {
  if (code?.startsWith("INVALID_RELAY")) return "relay";
  if (code?.includes("WEBRTC") || code?.includes("IDENTITY_MINT")) return "advanced";
  return "access";
}

/**
 * The server page's settings: access mode, welcome texts, WebRTC port range and relay nodes. Every change saves by itself: the form
 * schedules a save when a choice is made or a field is left, saves run one at a time and always send the whole document.
 */
export const useAdminServerSettingsStore = defineStore("adminServerSettings", () => {
  const admin = useAdminSessionStore();
  const feedback = useAdminFeedbackStore();
  const { t } = useI18n();

  const webrtcPortNoticeOpen = ref(false);
  const serverForm = reactive(initialServerForm());
  const welcomeLanguage = ref<WelcomeLanguage>(DEFAULT_LANGUAGE);
  /** What the gateway answered last. A value that is not valid yet is saved as this one. */
  let confirmed = initialServerForm();
  /** Until the settings are loaded the form holds placeholders, and nothing of it must reach the gateway. */
  let loaded = false;
  /** What the last save held back, and for which field the person sees a hint. */
  const issues = ref<SettingsIssues>({});
  const statuses = { access: createSaveStatus(), advanced: createSaveStatus(), relay: createSaveStatus() };
  /** Per field, whether it was just saved: the mark next to its label. */
  const fieldStatuses = new Map<string, SaveStatus>();
  const pending = new Set<SettingsSection>();
  let draining: Promise<void> | null = null;

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

  /** Copies a settings response (from GET) into the form. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- admin JSON bodies are read field by field, the gateway owns their shape
  function applySettings(value: Record<string, any>) {
    confirmed = serverFormFromSettings(value);
    Object.assign(serverForm, serverFormFromSettings(value));
    loaded = true;
  }

  function addRelayNode() {
    serverForm.relayNodes.push(createRelayNode());
  }
  function removeRelayNode(index: number) {
    serverForm.relayNodes.splice(index, 1);
    void scheduleSave("relay");
  }

  async function loadServerSettings() {
    applySettings(await admin.getJson("/api/admin/server"));
  }

  /** One save: the form as a document, if it says anything new. */
  async function savePass(sections: SettingsSection[]) {
    // Let the change that asked for the save reach the form first.
    await nextTick();
    if (!loaded) return;
    const { document, issues: held } = buildSettingsDocument(serverForm, confirmed);
    issues.value = held;
    const before = buildSettingsDocument(confirmed, confirmed).document;
    if (sameDocument(document, before)) {
      // The form says what the gateway keeps, so no refusal of an earlier save is still true.
      for (const section of SECTIONS) statuses[section].clearError();
      return;
    }
    for (const section of sections) statuses[section].saving();
    try {
      const result = await admin.sendJson("/api/admin/server", "PUT", document);
      confirmed = serverFormFromSettings(result.settings);
      for (const key of changedFieldKeys(document, before)) fieldStatus(key).saved();
      // The form gets a copy of its own, an edit must not reach `confirmed`.
      applySavedSettings(serverForm, document, serverFormFromSettings(result.settings));
      issues.value = Object.fromEntries(Object.entries(buildSettingsDocument(serverForm, confirmed).issues).filter(([key]) => key in held));
      for (const section of SECTIONS) {
        if (sections.includes(section)) statuses[section].saved();
        else statuses[section].clearError();
      }
    } catch (error) {
      for (const section of sections) statuses[section].reset();
      statuses[sectionOfError((error as ApiError).code)].failed(feedback.errorText((error as ApiError).code));
      return;
    }
    try {
      await adminSiblings().loadOverview();
    } catch (error) {
      feedback.fail(error);
    }
  }

  async function drain() {
    try {
      while (pending.size) {
        const sections = [...pending];
        pending.clear();
        await savePass(sections);
      }
    } finally {
      draining = null;
    }
  }

  /**
   * Saves the form after a change. Saves never overlap: a change made while one is running is saved by the next pass, which sends the
   * form as it is then, so two quick edits cannot overwrite each other. Resolves when nothing is left to save.
   */
  function scheduleSave(...sections: SettingsSection[]): Promise<void> {
    for (const section of sections) pending.add(section);
    draining ??= drain();
    return draining;
  }

  /** What the field `key` says about its last save, made on first use. */
  function fieldStatus(key: string): SaveStatus {
    let status = fieldStatuses.get(key);
    if (!status) {
      status = createSaveStatus();
      fieldStatuses.set(key, status);
    }
    return status;
  }

  /** The hint for a field that was not saved, or an empty text. */
  function issueText(key: string): string {
    const issue: SettingsIssue | undefined = issues.value[key];
    if (!issue) return "";
    switch (issue.code) {
      case "siteName":
        return t("issueSiteName");
      case "port":
        return t("issuePort", { min: issue.min, max: issue.max });
      case "portOrder":
        return t("issuePortOrder");
      case "number":
        return t("issueNumber", { min: issue.min, max: issue.max });
      case "relayName":
        return t("issueRelayName");
      case "relayTarget":
        return t("issueRelayTarget");
      case "relayTokenShort":
        return t("issueRelayTokenShort", { min: issue.min });
      case "relayTokenRequired":
        return t("issueRelayTokenRequired");
    }
  }

  function handleWebRtcToggle() {
    if (serverForm.webRtcEnabled) webrtcPortNoticeOpen.value = true;
    void scheduleSave("advanced");
  }

  /** Back to the empty form for logout, setup stores have no `$reset`. */
  function reset() {
    Object.assign(serverForm, initialServerForm());
    welcomeLanguage.value = "en";
    webrtcPortNoticeOpen.value = false;
    confirmed = initialServerForm();
    loaded = false;
    issues.value = {};
    pending.clear();
    for (const section of SECTIONS) statuses[section].reset();
    for (const status of fieldStatuses.values()) status.reset();
  }

  return {
    serverForm,
    statuses,
    issues,
    welcomeLanguage,
    selectedWelcomeText,
    selectedWelcomeLanguageLabel,
    selectedWelcomeDefault,
    webrtcPortNoticeOpen,
    webrtcPortRangeText,
    loadServerSettings,
    scheduleSave,
    issueText,
    fieldStatus,
    addRelayNode,
    removeRelayNode,
    handleWebRtcToggle,
    reset,
  };
});

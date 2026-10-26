import { computed, reactive, ref } from "vue";
import { defineStore } from "pinia";
import type { ApiError } from "@/features/admin/core/adminApi.js";
import { SERVER_LIST_STATUS, useAdminFeedbackStore } from "@/features/admin/core/adminFeedback.js";
import { createAdminFormat } from "@/features/admin/core/adminFormat.js";
import { createProbeText } from "@/features/admin/gateway/adminProbe.js";
import { initialServerDialog, type ProbeState } from "@/features/admin/gateway/adminServerForm.js";
import { adminSiblings } from "@/features/admin/core/adminSiblings.js";
import { useAdminSessionStore } from "@/features/admin/core/adminSession.js";
import type { AdminServer } from "@/features/admin/core/adminTypes.js";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { combineTeamSpeakTarget, splitTeamSpeakTarget } from "@/shared/lib/teamspeakTarget.js";

/** The add and edit dialog of the server list, with the connection test of the address typed into it. */
export const useAdminServerDialogStore = defineStore("adminServerDialog", () => {
  const admin = useAdminSessionStore();
  const feedback = useAdminFeedbackStore();
  const { language, t } = useI18n();
  const { connectionFailureText } = createAdminFormat(language, t);
  const { probeTitle, probeText } = createProbeText(t, connectionFailureText);

  const dialog = reactive(initialServerDialog());
  const testing = ref(false);
  const testResult = ref<ProbeState | null>(null);

  const dialogTitle = computed(() => (dialog.id ? t("editServer") : t("addServer")));
  const testResultTitle = computed(() => (testResult.value ? probeTitle(testResult.value) : ""));
  const testResultText = computed(() => (testResult.value ? probeText(testResult.value) : ""));

  function openAdd() {
    Object.assign(dialog, initialServerDialog(), { open: true });
    testResult.value = null;
  }

  function openEdit(server: AdminServer) {
    const target = splitTeamSpeakTarget(server.target);
    Object.assign(dialog, initialServerDialog(), {
      open: true,
      id: server.id,
      name: server.name,
      address: target.address,
      port: target.port,
      hasPassword: server.hasPassword,
      passwordAction: "keep",
    });
    testResult.value = null;
  }

  function dialogPayload() {
    return {
      name: dialog.name,
      target: combineTeamSpeakTarget(dialog.address, dialog.port),
      passwordAction: dialog.passwordAction,
      ...(dialog.passwordAction === "replace" ? { serverPassword: dialog.serverPassword } : {}),
    };
  }

  async function saveDialog() {
    dialog.saving = true;
    dialog.error = "";
    const adding = !dialog.id;
    try {
      const result = adding
        ? await admin.sendJson("/api/admin/servers", "POST", dialogPayload())
        : await admin.sendJson(`/api/admin/servers/${encodeURIComponent(dialog.id)}`, "PUT", dialogPayload());
      adminSiblings().replaceServers(result.servers);
      dialog.open = false;
      feedback.statusOf(SERVER_LIST_STATUS).saved();
      void adminSiblings().loadOverview();
      await adminSiblings().probeServer(result.server.id);
    } catch (error) {
      dialog.error = feedback.errorText((error as ApiError).code);
    } finally {
      dialog.saving = false;
    }
  }

  /** Tests the address in the dialog, which may not be saved yet. Nothing is kept. */
  async function testDialogConnection() {
    testing.value = true;
    testResult.value = null;
    try {
      testResult.value = await admin.sendJson("/api/admin/server/test", "POST", {
        target: combineTeamSpeakTarget(dialog.address, dialog.port),
      });
    } catch (error) {
      testResult.value = { ok: false, code: (error as ApiError).code };
    } finally {
      testing.value = false;
    }
  }

  /** Back to the empty state for logout, setup stores have no `$reset`. */
  function reset() {
    Object.assign(dialog, initialServerDialog());
    testResult.value = null;
    testing.value = false;
  }

  return {
    dialog,
    dialogTitle,
    testing,
    testResult,
    testResultTitle,
    testResultText,
    openAdd,
    openEdit,
    saveDialog,
    testDialogConnection,
    reset,
  };
});

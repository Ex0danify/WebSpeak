import { reactive, ref } from "vue";
import { defineStore } from "pinia";
import { SERVER_LIST_STATUS, useAdminFeedbackStore } from "@/features/admin/core/adminFeedback.js";
import { adminSiblings } from "@/features/admin/core/adminSiblings.js";
import { useAdminSessionStore } from "@/features/admin/core/adminSession.js";
import type { AdminServer } from "@/features/admin/core/adminTypes.js";
import { useDialog } from "@/shared/composables/useDialog.js";
import { useI18n } from "@/shared/i18n/useI18n.js";

export type ServerStatus = "probing" | "online" | "unreachable";

/** The TeamSpeak servers guests can choose from: the list and the live reachability of each. Order and the add/edit dialog have their own stores. */
export const useAdminServersStore = defineStore("adminServers", () => {
  const admin = useAdminSessionStore();
  const feedback = useAdminFeedbackStore();
  const { t } = useI18n();
  const { confirm } = useDialog();

  const servers = ref<AdminServer[]>([]);
  /** Outcome of probes made in this console session, a server without one shows its stored test result. */
  const probes = reactive<Record<string, ServerStatus>>({});
  /** Bumped on every full pass and on reset, so a pass that was overtaken stops probing. */
  let pass = 0;

  function statusOf(server: AdminServer): ServerStatus {
    return probes[server.id] ?? (server.lastTestError ? "unreachable" : server.lastTestAt ? "online" : "probing");
  }

  async function loadServers() {
    servers.value = (await admin.getJson("/api/admin/servers")).servers;
  }

  async function probeServer(id: string) {
    probes[id] = "probing";
    try {
      const result = await admin.sendJson(`/api/admin/servers/${encodeURIComponent(id)}/test`, "POST", {});
      probes[id] = result.ok ? "online" : "unreachable";
    } catch {
      probes[id] = "unreachable";
    }
  }

  /** One server after the other, so a long list does not open a burst of handshakes. */
  async function probeAll() {
    const current = ++pass;
    for (const { id } of [...servers.value]) {
      if (current !== pass) return;
      await probeServer(id);
    }
    if (current === pass) await adminSiblings().loadOverview();
  }

  async function removeServer(server: AdminServer) {
    const ok = await confirm({
      title: t("confirmRemoveServerTitle"),
      message: t("confirmRemoveServer", { name: server.name }),
      confirmLabel: t("remove"),
      cancelLabel: t("confirmCancel"),
      variant: "danger",
    });
    if (!ok) return;
    const status = feedback.statusOf(SERVER_LIST_STATUS);
    status.saving();
    try {
      const result = await admin.sendJson(`/api/admin/servers/${encodeURIComponent(server.id)}`, "DELETE", {});
      servers.value = result.servers;
      delete probes[server.id];
      status.saved();
      await adminSiblings().loadOverview();
    } catch (error) {
      feedback.failStatus(SERVER_LIST_STATUS, error);
    }
  }

  /** Back to the empty state for logout, setup stores have no `$reset`. */
  function reset() {
    pass++;
    servers.value = [];
    for (const id of Object.keys(probes)) delete probes[id];
  }

  return { servers, statusOf, loadServers, probeServer, probeAll, removeServer, reset };
});

import { computed, reactive, ref } from "vue";
import { defineStore } from "pinia";
import type { ApiError } from "@/features/admin/adminApi.js";
import { createAdminFormat } from "@/features/admin/adminFormat.js";
import { createProbeText } from "@/features/admin/adminProbe.js";
import { initialServerDialog, type ProbeState } from "@/features/admin/adminServerForm.js";
import { adminSiblings } from "@/features/admin/adminSiblings.js";
import { useAdminSessionStore } from "@/features/admin/adminSession.js";
import type { AdminServer } from "@/features/admin/adminTypes.js";
import { useDialog } from "@/shared/composables/useDialog.js";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { combineTeamSpeakTarget, splitTeamSpeakTarget } from "@/shared/lib/teamspeakTarget.js";

export type ServerStatus = "probing" | "online" | "unreachable";

/** The TeamSpeak servers guests can choose from: the list, the live reachability of each and the add/edit dialog. */
export const useAdminServersStore = defineStore("adminServers", () => {
  const admin = useAdminSessionStore();
  const { language, t } = useI18n();
  const { confirm } = useDialog();
  const { connectionFailureText } = createAdminFormat(language, t);
  const { probeTitle, probeText } = createProbeText(t, connectionFailureText);

  const servers = ref<AdminServer[]>([]);
  /** Outcome of probes made in this console session, a server without one shows its stored test result. */
  const probes = reactive<Record<string, ServerStatus>>({});
  const dialog = reactive(initialServerDialog());
  const testing = ref(false);
  const testResult = ref<ProbeState | null>(null);
  /** The server picked up for reordering, by pointer or keyboard. Empty when none. */
  const grabbed = ref("");
  /** What a screen reader hears about a move, in a live region. */
  const announcement = ref("");
  let orderBeforeGrab: AdminServer[] = [];
  /** Bumped on every full pass and on reset, so a pass that was overtaken stops probing. */
  let pass = 0;

  const dialogTitle = computed(() => (dialog.id ? t("editServer") : t("addServer")));
  const testResultTitle = computed(() => (testResult.value ? probeTitle(testResult.value) : ""));
  const testResultText = computed(() => (testResult.value ? probeText(testResult.value) : ""));

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

  const positionText = (id: string) => {
    const index = servers.value.findIndex((server) => server.id === id);
    return { name: servers.value[index]?.name ?? "", position: index + 1, total: servers.value.length };
  };

  function grabServer(id: string) {
    if (grabbed.value) return;
    grabbed.value = id;
    orderBeforeGrab = [...servers.value];
    announcement.value = t("serverGrabbed", positionText(id));
  }

  /** Moves the picked-up server to `index` in the list, without saving yet. */
  function moveGrabbedTo(index: number) {
    const from = servers.value.findIndex((server) => server.id === grabbed.value);
    const to = Math.max(0, Math.min(servers.value.length - 1, index));
    if (from < 0 || from === to) return;
    const next = [...servers.value];
    next.splice(to, 0, ...next.splice(from, 1));
    servers.value = next;
    announcement.value = t("serverMoved", positionText(grabbed.value));
  }

  function shiftGrabbed(delta: number) {
    moveGrabbedTo(servers.value.findIndex((server) => server.id === grabbed.value) + delta);
  }

  /** Puts the server down and saves the order when it changed. */
  async function dropServer() {
    const id = grabbed.value;
    if (!id) return;
    grabbed.value = "";
    const ids = servers.value.map((server) => server.id);
    if (ids.join() === orderBeforeGrab.map((server) => server.id).join()) {
      announcement.value = t("serverDropped", positionText(id));
      return;
    }
    try {
      const result = await admin.sendJson("/api/admin/servers/order", "PUT", { ids });
      servers.value = result.servers;
      announcement.value = t("serverDropped", positionText(id));
      admin.notify(t("serverOrderSaved"));
    } catch (error) {
      servers.value = orderBeforeGrab;
      admin.errorMessage = admin.errorText((error as ApiError).code);
    }
  }

  function cancelGrab() {
    if (!grabbed.value) return;
    servers.value = orderBeforeGrab;
    announcement.value = t("serverMoveCancelled", positionText(grabbed.value));
    grabbed.value = "";
  }

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
      servers.value = result.servers;
      dialog.open = false;
      admin.notify(adding ? t("serverAdded") : t("serverSaved"));
      void adminSiblings().loadOverview();
      await probeServer(result.server.id);
    } catch (error) {
      dialog.error = admin.errorText((error as ApiError).code);
    } finally {
      dialog.saving = false;
    }
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
    admin.errorMessage = "";
    try {
      const result = await admin.sendJson(`/api/admin/servers/${encodeURIComponent(server.id)}`, "DELETE", {});
      servers.value = result.servers;
      delete probes[server.id];
      admin.notify(t("serverRemoved", { name: server.name }));
      await adminSiblings().loadOverview();
    } catch (error) {
      admin.errorMessage = admin.errorText((error as ApiError).code);
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
    pass++;
    servers.value = [];
    grabbed.value = "";
    announcement.value = "";
    for (const id of Object.keys(probes)) delete probes[id];
    Object.assign(dialog, initialServerDialog());
    testResult.value = null;
    testing.value = false;
  }

  return {
    servers,
    dialog,
    dialogTitle,
    testing,
    testResult,
    testResultTitle,
    testResultText,
    grabbed,
    announcement,
    grabServer,
    moveGrabbedTo,
    shiftGrabbed,
    dropServer,
    cancelGrab,
    statusOf,
    loadServers,
    probeAll,
    openAdd,
    openEdit,
    saveDialog,
    removeServer,
    testDialogConnection,
    reset,
  };
});

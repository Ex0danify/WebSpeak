import { ref } from "vue";
import { defineStore } from "pinia";
import { useAdminFeedbackStore } from "@/features/admin/core/adminFeedback.js";
import { adminSiblings } from "@/features/admin/core/adminSiblings.js";
import { useAdminSessionStore } from "@/features/admin/core/adminSession.js";
import type { AdminServer } from "@/features/admin/core/adminTypes.js";
import { useI18n } from "@/shared/i18n/useI18n.js";

/** Reordering the server list: one server is picked up (by pointer or keyboard), moved locally and the new order saved when it is put down. */
export const useAdminServerOrderStore = defineStore("adminServerOrder", () => {
  const admin = useAdminSessionStore();
  const feedback = useAdminFeedbackStore();
  const { t } = useI18n();

  /** The server picked up for reordering. Empty when none. */
  const grabbed = ref("");
  /** What a screen reader hears about a move, in a live region. */
  const announcement = ref("");
  let orderBeforeGrab: AdminServer[] = [];

  const list = () => adminSiblings().serverList();

  const positionText = (id: string) => {
    const servers = list();
    const index = servers.findIndex((server) => server.id === id);
    return { name: servers[index]?.name ?? "", position: index + 1, total: servers.length };
  };

  function grabServer(id: string) {
    if (grabbed.value) return;
    grabbed.value = id;
    orderBeforeGrab = [...list()];
    announcement.value = t("serverGrabbed", positionText(id));
  }

  /** Moves the picked-up server to `index` in the list, without saving yet. */
  function moveGrabbedTo(index: number) {
    const servers = list();
    const from = servers.findIndex((server) => server.id === grabbed.value);
    const to = Math.max(0, Math.min(servers.length - 1, index));
    if (from < 0 || from === to) return;
    const next = [...servers];
    next.splice(to, 0, ...next.splice(from, 1));
    adminSiblings().replaceServers(next);
    announcement.value = t("serverMoved", positionText(grabbed.value));
  }

  function shiftGrabbed(delta: number) {
    moveGrabbedTo(list().findIndex((server) => server.id === grabbed.value) + delta);
  }

  /** Puts the server down and saves the order when it changed. */
  async function dropServer() {
    const id = grabbed.value;
    if (!id) return;
    grabbed.value = "";
    const ids = list().map((server) => server.id);
    if (ids.join() === orderBeforeGrab.map((server) => server.id).join()) {
      announcement.value = t("serverDropped", positionText(id));
      return;
    }
    try {
      const result = await admin.sendJson("/api/admin/servers/order", "PUT", { ids });
      adminSiblings().replaceServers(result.servers);
      announcement.value = t("serverDropped", positionText(id));
      feedback.notify(t("serverOrderSaved"));
    } catch (error) {
      adminSiblings().replaceServers(orderBeforeGrab);
      feedback.fail(error);
    }
  }

  function cancelGrab() {
    if (!grabbed.value) return;
    adminSiblings().replaceServers(orderBeforeGrab);
    announcement.value = t("serverMoveCancelled", positionText(grabbed.value));
    grabbed.value = "";
  }

  /** Back to the empty state for logout, setup stores have no `$reset`. */
  function reset() {
    grabbed.value = "";
    announcement.value = "";
    orderBeforeGrab = [];
  }

  return { grabbed, announcement, grabServer, moveGrabbedTo, shiftGrabbed, dropServer, cancelGrab, reset };
});

import { computed, reactive, ref } from "vue";
import { defineStore } from "pinia";
import type { ApiError } from "@/features/admin/core/adminApi.js";
import type { ManagedInvite } from "@/features/admin/core/adminTypes.js";
import { useAdminFeedbackStore } from "@/features/admin/core/adminFeedback.js";
import { useAdminSessionStore } from "@/features/admin/core/adminSession.js";
import { useDialog } from "@/shared/composables/useDialog.js";
import { useI18n } from "@/shared/i18n/useI18n.js";

/** How many invites the card on the users page shows, and how many a page of the full list holds. */
export const INVITE_PREVIEW = 8;
export const INVITE_PAGE_SIZE = 25;

export type InviteStatusFilter = "" | ManagedInvite["status"];

function initialInviteForm() {
  return { serverId: "", channel: "", expiresInHours: 24, maxUses: 0 };
}

function initialList() {
  return { items: [] as ManagedInvite[], total: 0, limit: INVITE_PREVIEW, page: 1, status: "" as InviteStatusFilter, loading: false };
}

/** The managed invite links: the list (the card and the full view share one query), the create dialog and revoking. */
export const useAdminInvitesStore = defineStore("adminInvites", () => {
  const admin = useAdminSessionStore();
  const feedback = useAdminFeedbackStore();
  const { t } = useI18n();
  const { confirm } = useDialog();

  const list = reactive(initialList());
  const creatingInvite = ref(false);
  const inviteForm = reactive(initialInviteForm());
  const createdInvite = ref<{ token: string; link: string } | null>(null);
  const inviteDialogOpen = ref(false);
  const inviteError = ref("");

  const pageCount = computed(() => Math.max(1, Math.ceil(list.total / list.limit)));

  /** `silent` is a refresh in the background: no spinner, no banner when it fails. */
  async function loadInvites(silent = false) {
    if (!silent) list.loading = true;
    await feedback.attempt(
      async () => {
        const query = new URLSearchParams({ limit: String(list.limit), offset: String((list.page - 1) * list.limit) });
        if (list.status) query.set("status", list.status);
        const result = await admin.getJson(`/api/admin/invites?${query}`);
        list.items = Array.isArray(result.invites) ? result.invites : [];
        list.total = Number(result.total) || 0;
      },
      () => {
        if (!silent) list.loading = false;
      },
      silent,
    );
  }

  /** The newest few, for the card. */
  function showPreview() {
    Object.assign(list, { limit: INVITE_PREVIEW, page: 1, status: "" });
    return loadInvites();
  }

  /** The whole list, a page at a time, for the full view. */
  function showPages(status: InviteStatusFilter = "") {
    Object.assign(list, { limit: INVITE_PAGE_SIZE, page: 1, status });
    return loadInvites();
  }

  function goToPage(page: number) {
    list.page = Math.min(Math.max(1, page), pageCount.value);
    return loadInvites();
  }

  function filterByStatus(status: InviteStatusFilter) {
    list.status = status;
    list.page = 1;
    return loadInvites();
  }

  /** After a change: the same query again, one page back when the last page has just run empty. */
  async function reload() {
    await loadInvites();
    if (!list.items.length && list.page > 1) await goToPage(pageCount.value);
  }

  function openCreateInvite() {
    Object.assign(inviteForm, initialInviteForm(), { serverId: inviteForm.serverId });
    createdInvite.value = null;
    inviteError.value = "";
    inviteDialogOpen.value = true;
  }

  async function createInvite() {
    creatingInvite.value = true;
    inviteError.value = "";
    createdInvite.value = null;
    try {
      const result = await admin.sendJson("/api/admin/invites", "POST", {
        serverId: inviteForm.serverId,
        channel: inviteForm.channel,
        expiresInHours: inviteForm.expiresInHours,
        maxUses: inviteForm.maxUses,
      });
      if (typeof result.token !== "string") throw new Error("INVITE_CREATE_FAILED");
      createdInvite.value = { token: result.token, link: `${location.origin}/?invite=${encodeURIComponent(result.token)}` };
      await reload();
    } catch (error) {
      inviteError.value = feedback.errorText((error as ApiError).code);
    } finally {
      creatingInvite.value = false;
    }
  }

  async function revokeInvite(invite: ManagedInvite) {
    const ok = await confirm({
      title: t("confirmRevokeTitle"),
      message: t("confirmRevoke"),
      confirmLabel: t("revoke"),
      cancelLabel: t("confirmCancel"),
      variant: "danger",
    });
    if (!ok) return;
    await feedback.attempt(async () => {
      await admin.sendJson(`/api/admin/invites/${encodeURIComponent(invite.id)}/revoke`, "POST", {});
      await reload();
      feedback.notify(t("inviteRevoked"));
    });
  }

  async function copyInviteLink() {
    if (!createdInvite.value) return;
    try {
      await navigator.clipboard.writeText(createdInvite.value.link);
      feedback.notify(t("copiedLink"));
    } catch {
      feedback.showError(t("operationFailed"));
    }
  }

  /** Back to the empty state for logout, setup stores have no `$reset`. */
  function reset() {
    Object.assign(list, initialList());
    Object.assign(inviteForm, initialInviteForm());
    createdInvite.value = null;
    inviteDialogOpen.value = false;
    inviteError.value = "";
    creatingInvite.value = false;
  }

  return {
    list,
    pageCount,
    creatingInvite,
    inviteForm,
    createdInvite,
    inviteDialogOpen,
    inviteError,
    loadInvites,
    showPreview,
    showPages,
    goToPage,
    filterByStatus,
    openCreateInvite,
    createInvite,
    revokeInvite,
    copyInviteLink,
    reset,
  };
});

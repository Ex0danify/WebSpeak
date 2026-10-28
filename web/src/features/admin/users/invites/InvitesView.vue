<template>
  <AdminListView
    :title="t('invites')"
    :lead="t('invitesLead')"
    back-to="/admin/users"
    :back-label="t('users')"
    :loading="list.loading"
    :items="list.items"
    :key-of="(invite) => invite.id"
    :total="list.total"
    :empty-text="t('inviteListEmpty')"
    empty-icon="send"
    :page="list.page"
    :page-count="pageCount"
    @update:page="goToPage"
    @refresh="loadInvites()"
  >
    <template #action>
      <Button variant="secondary" @click="openCreateInvite()"><Icon name="plus" :size="16" />{{ t("createInvite") }}</Button>
    </template>
    <template #toolbar>
      <Segmented
        :model-value="list.status"
        :aria-label="t('invitesFilter')"
        class="w-fit max-w-full flex-wrap"
        @update:model-value="filter"
      >
        <Segment v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</Segment>
      </Segmented>
    </template>
    <template #row="{ item }"><InviteRow :invite="item" /></template>
    <InviteDialog />
  </AdminListView>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Segment, Segmented } from "@/shared/ui/tabs";
import { useI18n } from "@/shared/i18n/useI18n";
import AdminListView from "@/features/admin/ui/AdminListView.vue";
import { useLiveRefresh } from "@/features/admin/core/useLiveRefresh";
import { createAdminFormat } from "@/features/admin/core/adminFormat";
import InviteDialog from "@/features/admin/users/invites/InviteDialog.vue";
import InviteRow from "@/features/admin/users/invites/InviteRow.vue";
import { useAdminInvitesStore, type InviteStatusFilter } from "@/features/admin/users/invites/adminInvites";

const invitesStore = useAdminInvitesStore();
const { list, pageCount } = storeToRefs(invitesStore);
const { openCreateInvite, loadInvites, showPages, goToPage, filterByStatus } = invitesStore;
onMounted(() => showPages());
useLiveRefresh(() => invitesStore.loadInvites(true), 15_000);

const { language, t } = useI18n();
const { inviteStatusLabel } = createAdminFormat(language, t);

const options = computed(() => [
  { value: "", label: t("filterAll") },
  ...(["active", "expired", "exhausted", "revoked"] as const).map((value) => ({ value, label: inviteStatusLabel(value) })),
]);
const filter = (value: unknown) => filterByStatus(value as InviteStatusFilter);
</script>

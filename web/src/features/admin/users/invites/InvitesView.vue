<template>
  <AdminPage :title="t('invites')" :lead="t('invitesLead')" back-to="/admin/users" :back-label="t('users')">
    <template #action>
      <Button variant="secondary" @click="openCreateInvite()"><Icon name="plus" :size="16" />{{ t("createInvite") }}</Button>
    </template>
    <Card padding="lg" body-class="grid content-start gap-3">
      <Segmented
        :model-value="list.status"
        :aria-label="t('invitesFilter')"
        class="w-fit max-w-full flex-wrap"
        @update:model-value="filter"
      >
        <Segment v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</Segment>
      </Segmented>
      <div
        v-if="!list.items.length"
        class="rounded-md border border-dashed border-line bg-surface-0 px-3 py-2.5 text-caption text-fg-muted"
      >
        {{ t("inviteListEmpty") }}
      </div>
      <ul v-else class="m-0 grid list-none gap-2.5 p-0" :aria-label="t('invites')">
        <InviteRow v-for="invite in list.items" :key="invite.id" :invite="invite" />
      </ul>
      <Pager
        v-if="pageCount > 1"
        :model-value="list.page"
        :page-count="pageCount"
        :label="t('pagerLabel')"
        :previous-label="t('pagePrevious')"
        :next-label="t('pageNext')"
        :first-label="t('pageFirst')"
        :last-label="t('pageLast')"
        :page-label="(number) => t('pageNumber', { page: number })"
        :summary="t('listPage', { page: list.page, count: pageCount })"
        @update:model-value="goToPage"
      />
    </Card>
    <InviteDialog />
  </AdminPage>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Icon } from "@/shared/ui/icon";
import { Pager } from "@/shared/ui/list";
import { Segment, Segmented } from "@/shared/ui/tabs";
import { useI18n } from "@/shared/i18n/useI18n";
import AdminPage from "@/features/admin/ui/AdminPage.vue";
import { createAdminFormat } from "@/features/admin/core/adminFormat";
import InviteDialog from "@/features/admin/users/invites/InviteDialog.vue";
import InviteRow from "@/features/admin/users/invites/InviteRow.vue";
import { useAdminInvitesStore, type InviteStatusFilter } from "@/features/admin/users/invites/adminInvites";

const invitesStore = useAdminInvitesStore();
const { list, pageCount } = storeToRefs(invitesStore);
const { openCreateInvite, showPages, goToPage, filterByStatus } = invitesStore;
onMounted(() => showPages());

const { language, t } = useI18n();
const { inviteStatusLabel } = createAdminFormat(language, t);

const options = computed(() => [
  { value: "", label: t("filterAll") },
  ...(["active", "expired", "exhausted", "revoked"] as const).map((value) => ({ value, label: inviteStatusLabel(value) })),
]);
const filter = (value: unknown) => filterByStatus(value as InviteStatusFilter);
</script>

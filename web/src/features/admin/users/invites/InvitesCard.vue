<template>
  <AdminSection :title="t('invites')" :lead="t('invitesLead')">
    <template #action>
      <Button variant="secondary" size="sm" class="shrink-0" @click="openCreateInvite()"
        ><Icon name="plus" :size="16" />{{ t("createInvite") }}</Button
      >
    </template>
    <div v-if="!list.items.length" class="rounded-md border border-dashed border-line bg-surface-0 px-3 py-2.5 text-caption text-fg-muted">
      {{ t("inviteListEmpty") }}
    </div>
    <ul v-else class="m-0 grid list-none gap-2.5 p-0" :aria-label="t('invites')">
      <InviteRow v-for="invite in list.items" :key="invite.id" :invite="invite" />
    </ul>
    <ListFooter v-if="list.total > list.items.length" :summary="t('listShowing', { shown: list.items.length, total: list.total })">
      <RouterLink to="/admin/users/invites" class="text-caption font-bold whitespace-nowrap text-accent no-underline">{{
        t("viewAllInvites")
      }}</RouterLink>
    </ListFooter>
    <InviteDialog />
  </AdminSection>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { RouterLink } from "vue-router";
import { storeToRefs } from "pinia";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { ListFooter } from "@/shared/ui/list";
import { useI18n } from "@/shared/i18n/useI18n";
import AdminSection from "@/features/admin/ui/AdminSection.vue";
import InviteDialog from "@/features/admin/users/invites/InviteDialog.vue";
import InviteRow from "@/features/admin/users/invites/InviteRow.vue";
import { useAdminInvitesStore } from "@/features/admin/users/invites/adminInvites";

const invitesStore = useAdminInvitesStore();
const { list } = storeToRefs(invitesStore);
const { openCreateInvite, showPreview } = invitesStore;
onMounted(showPreview);

const { t } = useI18n();
</script>

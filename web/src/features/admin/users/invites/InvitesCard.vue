<template>
  <AdminListCard
    :title="t('invites')"
    :lead="t('invitesLead')"
    :items="list.items"
    :key-of="(invite) => invite.id"
    :total="list.total"
    :empty-text="t('inviteListEmpty')"
    empty-icon="send"
    more-to="/admin/users/invites"
    :more-label="t('viewAllInvites')"
  >
    <template #action>
      <Button variant="secondary" size="sm" class="shrink-0" @click="openCreateInvite()"
        ><Icon name="plus" :size="16" />{{ t("createInvite") }}</Button
      >
    </template>
    <template #row="{ item }"><InviteRow :invite="item" /></template>
  </AdminListCard>
  <InviteDialog />
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { storeToRefs } from "pinia";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n";
import AdminListCard from "@/features/admin/ui/AdminListCard.vue";
import { useLiveRefresh } from "@/features/admin/core/useLiveRefresh";
import InviteDialog from "@/features/admin/users/invites/InviteDialog.vue";
import InviteRow from "@/features/admin/users/invites/InviteRow.vue";
import { useAdminInvitesStore } from "@/features/admin/users/invites/adminInvites";

const invitesStore = useAdminInvitesStore();
const { list } = storeToRefs(invitesStore);
const { openCreateInvite, showPreview } = invitesStore;
onMounted(showPreview);
useLiveRefresh(() => invitesStore.loadInvites(true), 15_000);

const { t } = useI18n();
</script>

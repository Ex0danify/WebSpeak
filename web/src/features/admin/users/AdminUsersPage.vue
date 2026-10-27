<template>
  <AdminPage :title="t('users')" :lead="t('usersLead')">
    <template #action>
      <Button variant="secondary" :loading="loading" @click="refresh()">
        <Icon v-if="!loading" name="refresh" :size="17" />{{ t("refresh") }}
      </Button>
    </template>
    <div class="grid items-start gap-4 wide:grid-cols-5">
      <div v-for="column in columns" :key="column.id" :class="['grid min-w-0 content-start gap-4', column.class]">
        <component :is="card.component" v-for="card in column.cards" :key="card.id" />
      </div>
    </div>
  </AdminPage>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n";
import AdminPage from "@/features/admin/ui/AdminPage.vue";
import type { AdminPageCard } from "@/features/admin/ui/adminPage";
import { useAdminUsersStore } from "@/features/admin/users/adminUsers";
import { useAdminInvitesStore } from "@/features/admin/users/invites/adminInvites";
import InvitesCard from "@/features/admin/users/invites/InvitesCard.vue";
import ConnectionsCard from "@/features/admin/users/connections/ConnectionsCard.vue";
import { useAdminConnectionsStore } from "@/features/admin/users/connections/adminConnections";
import SessionsCard from "@/features/admin/users/sessions/SessionsCard.vue";

const usersStore = useAdminUsersStore();
const invitesStore = useAdminInvitesStore();
const connectionsStore = useAdminConnectionsStore();
const { sessionsLoading } = storeToRefs(usersStore);
const { list: connections } = storeToRefs(connectionsStore);
const { list } = storeToRefs(invitesStore);
// Each card loads its own data when it appears, Refresh asks for all of them again.
const loading = computed(() => sessionsLoading.value || list.value.loading || connections.value.loading);
const refresh = () => Promise.all([usersStore.loadSessions(), invitesStore.loadInvites(), connectionsStore.loadConnections()]);

const { t } = useI18n();

// Who is here with the history of everyone who was beneath it, the invites beside them.
const columns: Array<{ id: string; class: string; cards: AdminPageCard[] }> = [
  {
    id: "people",
    class: "wide:col-span-3",
    cards: [
      { id: "sessions", component: SessionsCard },
      { id: "connections", component: ConnectionsCard },
    ],
  },
  { id: "invites", class: "wide:col-span-2", cards: [{ id: "invites", component: InvitesCard }] },
];
</script>

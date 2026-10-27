<template>
  <AdminPage :title="t('users')" :lead="t('usersLead')">
    <template #action>
      <Button variant="secondary" :loading="loading" @click="refresh()">
        <Icon v-if="!loading" name="refresh" :size="17" />{{ t("refresh") }}
      </Button>
    </template>
    <div v-for="row in rows" :key="row.id" :class="row.class">
      <component :is="card.component" v-for="card in row.cards" :key="card.id" :class="card.class" />
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

// Who is here and the invites side by side, the history of everyone who was below across the whole width.
const rows: Array<{ id: string; class?: string; cards: AdminPageCard[] }> = [
  {
    id: "now",
    class: "grid items-start gap-4 wide:grid-cols-5",
    cards: [
      { id: "sessions", component: SessionsCard, class: "wide:col-span-3" },
      { id: "invites", component: InvitesCard, class: "wide:col-span-2" },
    ],
  },
  { id: "history", cards: [{ id: "connections", component: ConnectionsCard }] },
];
</script>

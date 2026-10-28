<template>
  <AdminListCard
    :title="t('sessions')"
    :lead="t('sessionsLead')"
    :items="shown"
    :key-of="(session) => session.id"
    :total="users.sessions.length"
    :empty-text="t('sessionEmpty')"
    empty-icon="users"
    more-to="/admin/users/sessions"
    :more-label="t('viewAllSessions')"
  >
    <template #action>
      <strong class="text-xl text-accent">{{ users.sessions.length }}</strong>
    </template>
    <template #list><SessionsTable :sessions="shown" class="border-t border-line" /></template>
  </AdminListCard>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useI18n } from "@/shared/i18n/useI18n";
import AdminListCard from "@/features/admin/ui/AdminListCard.vue";
import { useLiveRefresh } from "@/features/admin/core/useLiveRefresh";
import SessionsTable from "@/features/admin/users/sessions/SessionsTable.vue";
import { SESSION_PREVIEW, useAdminUsersStore } from "@/features/admin/users/adminUsers";

const usersStore = useAdminUsersStore();
const { users } = storeToRefs(usersStore);
onMounted(usersStore.loadSessions);
useLiveRefresh(() => usersStore.loadSessions(true), 5000);

const shown = computed(() => users.value.sessions.slice(0, SESSION_PREVIEW));
const { t } = useI18n();
</script>

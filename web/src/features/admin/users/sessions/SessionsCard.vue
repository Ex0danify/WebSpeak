<template>
  <AdminSection :title="t('sessions')" :lead="t('sessionsLead')">
    <template #action>
      <strong class="text-xl text-accent">{{ users.sessions.length }}</strong>
    </template>
    <SessionsTable v-if="users.sessions.length" :sessions="shown" class="border-t border-line" />
    <div v-else class="grid min-h-32.5 place-items-center gap-2 text-center text-caption text-fg-muted">
      <Icon name="users" :size="22" class="text-accent" />
      <span>{{ t("sessionEmpty") }}</span>
    </div>
    <ListFooter
      v-if="users.sessions.length > shown.length"
      :summary="t('listShowing', { shown: shown.length, total: users.sessions.length })"
    >
      <RouterLink to="/admin/users/sessions" class="text-caption font-bold whitespace-nowrap text-accent no-underline">{{
        t("viewAllSessions")
      }}</RouterLink>
    </ListFooter>
  </AdminSection>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { RouterLink } from "vue-router";
import { storeToRefs } from "pinia";
import { Icon } from "@/shared/ui/icon";
import { ListFooter } from "@/shared/ui/list";
import { useI18n } from "@/shared/i18n/useI18n";
import AdminSection from "@/features/admin/ui/AdminSection.vue";
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

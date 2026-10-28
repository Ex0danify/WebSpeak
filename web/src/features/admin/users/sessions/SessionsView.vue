<template>
  <AdminListView
    :title="t('sessions')"
    :lead="t('sessionsLead')"
    back-to="/admin/users"
    :back-label="t('users')"
    :loading="sessionsLoading"
    :items="shown"
    :key-of="(session) => session.id"
    :total="users.sessions.length"
    :empty-text="t('sessionEmpty')"
    empty-icon="users"
    :page="page"
    :page-count="pageCount"
    @update:page="(value: number) => (page = value)"
    @refresh="loadSessions()"
  >
    <template #list><SessionsTable :sessions="shown" /></template>
  </AdminListView>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useI18n } from "@/shared/i18n/useI18n";
import AdminListView from "@/features/admin/ui/AdminListView.vue";
import { useLiveRefresh } from "@/features/admin/core/useLiveRefresh";
import SessionsTable from "@/features/admin/users/sessions/SessionsTable.vue";
import { SESSION_PAGE_SIZE, useAdminUsersStore } from "@/features/admin/users/adminUsers";

const usersStore = useAdminUsersStore();
const { users, sessionsLoading } = storeToRefs(usersStore);
const { loadSessions } = usersStore;
onMounted(loadSessions);
useLiveRefresh(() => loadSessions(true), 5000);

// The gateway sends every live session (at most 100), so the pages are cut here.
const page = ref(1);
const pageCount = computed(() => Math.max(1, Math.ceil(users.value.sessions.length / SESSION_PAGE_SIZE)));
const shown = computed(() => users.value.sessions.slice((page.value - 1) * SESSION_PAGE_SIZE, page.value * SESSION_PAGE_SIZE));
// Sessions end while the page is open, so the last page can run empty.
watch(pageCount, (count) => {
  if (page.value > count) page.value = count;
});

const { t } = useI18n();
</script>

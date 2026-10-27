<template>
  <AdminPage :title="t('sessions')" :lead="t('sessionsLead')" back-to="/admin/users" :back-label="t('users')">
    <template #action>
      <Button variant="secondary" :loading="sessionsLoading" @click="loadSessions()">
        <Icon v-if="!sessionsLoading" name="refresh" :size="17" />{{ t("refresh") }}
      </Button>
    </template>
    <Card padding="lg" body-class="grid content-start gap-3">
      <SessionsTable v-if="users.sessions.length" :sessions="shown" />
      <div v-else class="grid min-h-32.5 place-items-center gap-2 text-center text-caption text-fg-muted">
        <Icon name="users" :size="22" class="text-accent" />
        <span>{{ t("sessionEmpty") }}</span>
      </div>
      <Pager
        v-if="pageCount > 1"
        v-model="page"
        :page-count="pageCount"
        :label="t('pagerLabel')"
        :previous-label="t('pagePrevious')"
        :next-label="t('pageNext')"
        :first-label="t('pageFirst')"
        :last-label="t('pageLast')"
        :page-label="(number) => t('pageNumber', { page: number })"
        :summary="t('listPage', { page, count: pageCount })"
      />
    </Card>
  </AdminPage>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Icon } from "@/shared/ui/icon";
import { Pager } from "@/shared/ui/list";
import { useI18n } from "@/shared/i18n/useI18n";
import AdminPage from "@/features/admin/ui/AdminPage.vue";
import SessionsTable from "@/features/admin/users/sessions/SessionsTable.vue";
import { SESSION_PAGE_SIZE, useAdminUsersStore } from "@/features/admin/users/adminUsers";

const usersStore = useAdminUsersStore();
const { users, sessionsLoading } = storeToRefs(usersStore);
const { loadSessions } = usersStore;
onMounted(loadSessions);

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

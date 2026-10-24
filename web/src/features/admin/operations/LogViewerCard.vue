<template>
  <AdminSection :title="t('logViewer')" :lead="t('logViewerLead')" padding="lg" leading="tight" :body-class="bodyClass">
    <template #action>
      <span v-if="!operations.logs.available" class="text-2xs text-fg-muted">{{ t("logsUnavailable") }}</span>
    </template>
    <ConnectionHistory v-if="operations.logs.sessions.length" :class="historyClass" />
    <LogEntries v-if="operations.logs.entries.length" :class="entriesClass" />
    <div
      v-if="!operations.logs.sessions.length && !operations.logs.entries.length"
      class="grid min-h-32.5 place-items-center gap-2 text-center text-caption text-fg-muted"
    >
      <Icon name="activity" :size="22" class="text-accent" />
      <span>{{ t("noLogs") }}</span>
    </div>
  </AdminSection>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { Icon } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n";
import AdminSection from "@/features/admin/AdminSection.vue";
import { useAdminOperationsStore } from "@/features/admin/adminOperations";
import ConnectionHistory from "@/features/admin/operations/ConnectionHistory.vue";
import LogEntries from "@/features/admin/operations/LogEntries.vue";

/** The page frames the two lists: `historyClass` and `entriesClass` are their sizing and scrolling. */
defineProps<{ bodyClass?: string; historyClass?: string; entriesClass?: string }>();

const { operations } = storeToRefs(useAdminOperationsStore());
const { t } = useI18n();
</script>

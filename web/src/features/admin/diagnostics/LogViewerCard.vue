<template>
  <AdminSection :title="t('logViewer')" :lead="t('logViewerLead')">
    <template #action>
      <span v-if="!diagnostics.logs.available" class="text-2xs text-fg-muted">{{ t("logsUnavailable") }}</span>
    </template>
    <div v-if="diagnostics.logs.sessions.length || diagnostics.logs.entries.length" class="grid items-start gap-4 wide:grid-cols-2">
      <ConnectionHistory v-if="diagnostics.logs.sessions.length" />
      <LogEntries v-if="diagnostics.logs.entries.length" />
    </div>
    <div v-else class="grid min-h-32.5 place-items-center gap-2 text-center text-caption text-fg-muted">
      <Icon name="activity" :size="22" class="text-accent" />
      <span>{{ t("noLogs") }}</span>
    </div>
  </AdminSection>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { Icon } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n";
import AdminSection from "@/features/admin/ui/AdminSection.vue";
import { useAdminDiagnosticsStore } from "@/features/admin/diagnostics/adminDiagnostics";
import ConnectionHistory from "@/features/admin/diagnostics/ConnectionHistory.vue";
import LogEntries from "@/features/admin/diagnostics/LogEntries.vue";

const { diagnostics } = storeToRefs(useAdminDiagnosticsStore());
const { t } = useI18n();
</script>

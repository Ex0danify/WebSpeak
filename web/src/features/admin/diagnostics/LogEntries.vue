<template>
  <div class="grid min-w-0 content-start gap-2">
    <div class="grid gap-0.75 border-b border-line pb-1.5">
      <strong class="text-2xs">{{ t("logEntries") }}</strong>
      <small class="text-2xs text-fg-muted">{{ t("logEntriesLead") }}</small>
    </div>
    <ScrollRegion :label="t('logEntries')" class="grid content-start gap-1.75">
      <AdminListRow
        v-for="(entry, index) in diagnostics.logs.entries"
        :key="`${entry.timestamp}-${index}`"
        size="sm"
        class="flex max-w-full min-w-0 items-start gap-2"
      >
        <span :class="['flex-none rounded-sm px-1.25 py-0.75 text-2xs font-extrabold', logLevelClass(entry.level)]">{{ entry.level }}</span>
        <div class="min-w-0 flex-1">
          <strong class="block text-2xs wrap-anywhere">{{ entry.message || "—" }}</strong>
          <small class="mt-1 block text-2xs wrap-anywhere text-fg-muted">
            {{ formatDate(entry.timestamp)
            }}<template v-if="Object.keys(entry.context).length"> · {{ formatContext(entry.context) }}</template>
          </small>
        </div>
      </AdminListRow>
    </ScrollRegion>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useI18n } from "@/shared/i18n/useI18n";
import AdminListRow from "@/features/admin/ui/AdminListRow.vue";
import ScrollRegion from "@/features/admin/ui/ScrollRegion.vue";
import { createAdminFormat } from "@/features/admin/core/adminFormat";
import { useAdminDiagnosticsStore } from "@/features/admin/diagnostics/adminDiagnostics";

const { diagnostics } = storeToRefs(useAdminDiagnosticsStore());
const { language, t } = useI18n();
const { formatDate, formatContext } = createAdminFormat(language, t);

function logLevelClass(level: string) {
  const l = level.toLowerCase();
  if (l === "warn") return "bg-warning-soft text-warning";
  if (l === "error" || l === "fatal") return "bg-danger-soft text-danger";
  return "bg-accent-soft text-accent";
}
</script>

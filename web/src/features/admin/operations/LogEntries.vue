<template>
  <div :class="cn('mt-4 grid w-full min-w-0 gap-1.75', props.class)" role="region" tabindex="0" :aria-label="t('logViewer')">
    <AdminListRow
      v-for="(entry, index) in operations.logs.entries"
      :key="`${entry.timestamp}-${index}`"
      size="sm"
      class="flex max-w-full min-w-0 items-start gap-2 max-desktop:overflow-hidden"
    >
      <span :class="['flex-none rounded-sm px-1.25 py-0.75 text-2xs font-extrabold', logLevelClass(entry.level)]">{{ entry.level }}</span>
      <div class="min-w-0 max-desktop:w-0 max-desktop:max-w-full max-desktop:flex-auto max-desktop:overflow-hidden">
        <strong class="block text-2xs wrap-anywhere">{{ entry.message || "—" }}</strong>
        <small class="mt-1 block text-2xs wrap-anywhere text-fg-muted">
          {{ formatDate(entry.timestamp)
          }}<template v-if="Object.keys(entry.context).length"> · {{ formatContext(entry.context) }}</template>
        </small>
      </div>
    </AdminListRow>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { cn } from "@/shared/lib/cn";
import { useI18n } from "@/shared/i18n/useI18n";
import AdminListRow from "@/features/admin/AdminListRow.vue";
import { createAdminFormat } from "@/features/admin/adminFormat";
import { useAdminOperationsStore } from "@/features/admin/adminOperations";

// `class` is how the page frames (and scrolls) the list.
const props = defineProps<{ class?: string }>();

const { operations } = storeToRefs(useAdminOperationsStore());
const { language, t } = useI18n();
const { formatDate, formatContext } = createAdminFormat(language, t);

function logLevelClass(level: string) {
  const l = level.toLowerCase();
  if (l === "warn") return "bg-warning-soft text-warning";
  if (l === "error" || l === "fatal") return "bg-danger-soft text-danger";
  return "bg-accent-soft text-accent";
}
</script>

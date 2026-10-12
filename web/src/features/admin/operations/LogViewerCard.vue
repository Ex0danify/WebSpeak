<template>
  <Card as="article" padding="lg" body-class="flex min-h-0 flex-col" class="min-h-0 overflow-hidden max-desktop:overflow-visible">
    <header class="flex items-start justify-between gap-3.75">
      <div>
        <h3 class="text-md font-bold">{{ t("logViewer") }}</h3>
        <p class="mt-1.25 text-2xs leading-tight text-fg-muted">{{ t("logViewerLead") }}</p>
      </div>
      <span v-if="!operations.logs.available" class="text-2xs text-fg-muted">{{ t("logsUnavailable") }}</span>
    </header>
    <div
      v-if="operations.logs.sessions.length"
      class="mt-3 grid max-h-45 gap-1.75 overflow-y-auto"
      role="region"
      tabindex="0"
      :aria-label="t('connectionHistory')"
    >
      <div class="grid gap-0.75 border-b border-line pb-1.5">
        <strong class="text-2xs">{{ t("connectionHistory") }}</strong>
        <small class="text-2xs text-fg-muted">{{ t("connectionHistoryLead") }}</small>
      </div>
      <div
        v-for="record in operations.logs.sessions"
        :key="record.id"
        class="flex items-start justify-between gap-2.5 rounded-md bg-surface-0 p-2 max-narrow:grid max-narrow:gap-1.75"
      >
        <div class="min-w-0 flex-auto">
          <strong class="block text-2xs wrap-anywhere">{{ record.nickname }}</strong>
          <small :class="[connSmall, 'mt-0.75 text-fg-muted']">{{ record.target }}</small>
          <small :class="[connSmall, 'mt-0.75 font-semibold text-accent']">{{ connectionRoute(record) }}</small>
        </div>
        <div
          class="grid min-w-0 shrink basis-7/12 justify-items-end gap-0.5 text-right max-narrow:justify-items-start max-narrow:text-left"
        >
          <span
            :class="[
              'inline-flex rounded-full px-1.5 py-0.75 text-2xs font-extrabold',
              connectionStatusClass[record.status] ?? 'bg-accent-soft text-accent',
            ]"
          >
            {{ connectionStatusLabel(record.status) }}
          </span>
          <small :class="[connSmall, 'text-fg-muted']">
            {{ record.connectedAt ? t("connectedAt") : t("connectionAttemptedAt") }}:
            {{ formatDate(record.connectedAt || record.startedAt) }}
          </small>
          <small :class="[connSmall, 'text-fg-muted']">{{ t("duration") }}: {{ formatAge(record.durationSeconds) }}</small>
          <small v-if="record.disconnectedAt" :class="[connSmall, 'text-fg-muted']"
            >{{ t("disconnectedAt") }}: {{ formatDate(record.disconnectedAt) }}</small
          >
          <small v-if="record.reason" :class="[connSmall, 'text-fg-muted']"
            >{{ t("failureReason") }}: {{ connectionFailureText(record.reason) }}</small
          >
          <small v-if="record.failureDetail" :class="[connSmall, 'text-fg-muted']"
            >{{ t("failureDetail") }}: {{ record.failureDetail }}</small
          >
        </div>
      </div>
    </div>
    <div
      v-if="operations.logs.entries.length"
      class="mt-4 grid min-h-0 w-full min-w-0 flex-1 basis-0 gap-1.75 overflow-y-auto max-desktop:flex-none max-desktop:overflow-visible"
      role="region"
      tabindex="0"
      :aria-label="t('logViewer')"
    >
      <div
        v-for="(entry, index) in operations.logs.entries"
        :key="`${entry.timestamp}-${index}`"
        class="flex max-w-full min-w-0 items-start gap-2 rounded-md bg-surface-0 p-2 max-desktop:overflow-hidden"
      >
        <span :class="['flex-none rounded-sm px-1.25 py-0.75 text-2xs font-extrabold', logLevelClass(entry.level)]">{{ entry.level }}</span>
        <div class="min-w-0 max-desktop:w-0 max-desktop:max-w-full max-desktop:flex-auto max-desktop:overflow-hidden">
          <strong class="block text-2xs wrap-anywhere">{{ entry.message || "—" }}</strong>
          <small class="mt-1 block text-2xs wrap-anywhere text-fg-muted">
            {{ formatDate(entry.timestamp)
            }}<template v-if="Object.keys(entry.context).length"> · {{ formatContext(entry.context) }}</template>
          </small>
        </div>
      </div>
    </div>
    <div
      v-if="!operations.logs.sessions.length && !operations.logs.entries.length"
      class="grid min-h-32.5 place-items-center gap-2 text-center text-caption text-fg-muted"
    >
      <Icon name="activity" :size="22" class="text-accent" />
      <span>{{ t("noLogs") }}</span>
    </div>
  </Card>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { Card } from "@/shared/ui/card";
import { Icon } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n";
import { createAdminFormat } from "../adminFormat";
import { useAdminOperationsStore } from "../adminOperations";

const { operations } = storeToRefs(useAdminOperationsStore());
const { language, t } = useI18n();
const { formatDate, formatAge, connectionStatusLabel, connectionRoute, formatContext, connectionFailureText } = createAdminFormat(
  language,
  t,
);

const connSmall = "block text-2xs wrap-anywhere";
const connectionStatusClass: Record<string, string> = {
  disconnected: "bg-surface-2 text-fg-muted",
  failed: "bg-danger-soft text-danger",
  connecting: "bg-warning-soft text-warning",
};
function logLevelClass(level: string) {
  const l = level.toLowerCase();
  if (l === "warn") return "bg-warning-soft text-warning";
  if (l === "error" || l === "fatal") return "bg-danger-soft text-danger";
  return "bg-accent-soft text-accent";
}
</script>

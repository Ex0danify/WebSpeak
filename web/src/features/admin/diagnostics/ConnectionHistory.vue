<template>
  <div class="grid min-w-0 content-start gap-2">
    <div class="grid gap-0.75 border-b border-line pb-1.5">
      <strong class="text-2xs">{{ t("connectionHistory") }}</strong>
      <small class="text-2xs text-fg-muted">{{ t("connectionHistoryLead") }}</small>
    </div>
    <ScrollRegion :label="t('connectionHistory')" class="grid content-start gap-1.75">
      <AdminListRow v-for="record in diagnostics.logs.sessions" :key="record.id" size="sm" class="grid gap-1.75">
        <div class="min-w-0">
          <strong class="block text-2xs wrap-anywhere">{{ record.nickname }}</strong>
          <small :class="[connSmall, 'mt-0.75 text-fg-muted']">{{ record.target }}</small>
          <small :class="[connSmall, 'mt-0.75 font-semibold text-accent']">{{ connectionRoute(record) }}</small>
        </div>
        <div class="grid min-w-0 justify-items-start gap-0.5">
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
const { formatDate, formatAge, connectionStatusLabel, connectionRoute, connectionFailureText } = createAdminFormat(language, t);

const connSmall = "block text-2xs wrap-anywhere";
const connectionStatusClass: Record<string, string> = {
  disconnected: "bg-surface-2 text-fg-muted",
  failed: "bg-danger-soft text-danger",
  connecting: "bg-warning-soft text-warning",
};
</script>

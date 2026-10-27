<template>
  <!-- `connection-row` is the e2e locator -->
  <AdminListRow as="li" class="connection-row grid gap-1.75">
    <div class="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
      <div class="min-w-0">
        <strong class="block text-caption wrap-anywhere">{{ record.nickname }}</strong>
        <small :class="[line, 'text-fg-muted']">{{ record.target }}</small>
        <small :class="[line, 'font-semibold text-accent']">{{ connectionRoute(record) }}</small>
      </div>
      <Chip :variant="statusVariant[record.status]">{{ connectionStatusLabel(record.status) }}</Chip>
    </div>
    <div class="grid min-w-0 gap-0.5">
      <small :class="[line, 'text-fg-muted']">
        {{ record.connectedAt ? t("connectedAt") : t("connectionAttemptedAt") }}: {{ formatDate(record.connectedAt || record.startedAt) }}
      </small>
      <small :class="[line, 'text-fg-muted']">{{ t("duration") }}: {{ formatAge(record.durationSeconds) }}</small>
      <small v-if="record.disconnectedAt" :class="[line, 'text-fg-muted']"
        >{{ t("disconnectedAt") }}: {{ formatDate(record.disconnectedAt) }}</small
      >
      <small v-if="record.reason" :class="[line, 'text-fg-muted']"
        >{{ t("failureReason") }}: {{ connectionFailureText(record.reason) }}</small
      >
      <small v-if="record.failureDetail" :class="[line, 'text-fg-muted']">{{ t("failureDetail") }}: {{ record.failureDetail }}</small>
      <small v-for="audio in connectionAudioLines(record.audio)" :key="audio" :class="[line, 'text-fg-muted']">{{ audio }}</small>
    </div>
  </AdminListRow>
</template>

<script setup lang="ts">
import { Chip } from "@/shared/ui/chip";
import { useI18n } from "@/shared/i18n/useI18n";
import AdminListRow from "@/features/admin/ui/AdminListRow.vue";
import { createAdminFormat } from "@/features/admin/core/adminFormat";
import type { AdminConnectionRecord } from "@/features/admin/core/adminTypes";

defineProps<{ record: AdminConnectionRecord }>();

const { language, t } = useI18n();
const { formatDate, formatAge, connectionStatusLabel, connectionRoute, connectionFailureText, connectionAudioLines } = createAdminFormat(
  language,
  t,
);

const line = "block text-2xs wrap-anywhere";
const statusVariant = { active: "success", connecting: "warning", disconnected: "neutral", failed: "danger" } as const;
</script>

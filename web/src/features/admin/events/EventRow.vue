<template>
  <!-- `event-row` is the e2e locator -->
  <AdminListRow as="li" class="event-row flex min-w-0 items-center gap-2.5">
    <span :class="cn('grid size-6.75 shrink-0 place-items-center rounded-md', tone[event.severity])">
      <Icon :name="icons[event.category]" :size="14" />
    </span>
    <div class="min-w-0 flex-1">
      <strong class="block text-caption wrap-anywhere">{{ title(event.event) }}</strong>
      <span v-if="text.summary" class="mt-0.5 block text-2xs wrap-anywhere text-fg-muted">{{ text.summary }}</span>
      <ul v-if="text.changes.length" class="m-0 mt-0.5 grid list-none gap-0.5 p-0 text-2xs wrap-anywhere text-fg-muted">
        <li v-for="change in text.changes" :key="change">{{ change }}</li>
      </ul>
      <time :datetime="event.createdAt" class="mt-0.75 block text-2xs text-fg-muted">{{ formatDate(event.createdAt) }}</time>
    </div>
    <Chip v-if="event.severity === 'error'" variant="danger">{{ t("eventSeverityError") }}</Chip>
    <Chip v-else-if="event.severity === 'warning'" variant="warning">{{ t("eventSeverityWarning") }}</Chip>
  </AdminListRow>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/shared/lib/cn";
import { Chip } from "@/shared/ui/chip";
import { Icon, type IconName } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n";
import AdminListRow from "@/features/admin/ui/AdminListRow.vue";
import { createAdminFormat } from "@/features/admin/core/adminFormat";
import type { AdminEvent, AdminEventCategory, AdminEventSeverity } from "@/features/admin/core/adminTypes";
import { createEventText } from "@/features/admin/events/eventText";

const props = defineProps<{ event: AdminEvent }>();

const icons: Record<AdminEventCategory, IconName> = {
  auth: "lock",
  config: "settings",
  invites: "send",
  availability: "activity",
  system: "info",
};
// The severity is also written out in the chip, the tint only helps scanning.
const tone: Record<AdminEventSeverity, string> = {
  info: "bg-accent-soft text-accent",
  warning: "bg-warning-soft text-warning",
  error: "bg-danger-soft text-danger",
};

const { language, t } = useI18n();
const { formatDate } = createAdminFormat(language, t);
const { title, detail } = createEventText(language, t);
const text = computed(() => detail(props.event));
</script>

<template>
  <AdminSection
    :title="t('recentEvents')"
    :lead="t('recentEventsLead')"
    padding="sm"
    flush
    leading="none"
    header-class="gap-0"
    :body-class="bodyClass"
    class="p-6 max-narrow:p-4.5"
  >
    <ul :class="['m-0 mt-4.5 grid list-none content-start gap-2.5 p-0', listClass]">
      <AdminEventRow v-for="event in overview.recentEvents" :key="`${event.event}-${event.createdAt}`" :event="event" />
      <AdminListRow v-if="!overview.recentEvents.length" as="li" class="text-center text-fg-muted">{{ t("noRecentEvents") }}</AdminListRow>
    </ul>
  </AdminSection>
</template>

<script setup lang="ts">
import AdminEventRow from "@/features/admin/ui/AdminEventRow.vue";
import AdminListRow from "@/features/admin/ui/AdminListRow.vue";
import AdminSection from "@/features/admin/ui/AdminSection.vue";
import { useAdminOverviewStore } from "@/features/admin/overview/adminOverview";
import { useI18n } from "@/shared/i18n/useI18n";

/** `bodyClass` and `listClass` are how the page lets the event list scroll. */
defineProps<{ bodyClass?: string; listClass?: string }>();

const { t } = useI18n();
const { overview } = useAdminOverviewStore();
</script>

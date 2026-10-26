<template>
  <AdminSection :title="t('recentEvents')" :lead="t('recentEventsLead')">
    <template #action>
      <RouterLink to="/admin/diagnostics" class="text-caption font-bold whitespace-nowrap text-accent no-underline">{{
        t("viewAll")
      }}</RouterLink>
    </template>
    <ul class="m-0 grid list-none gap-2.5 p-0">
      <AdminEventRow v-for="event in recent" :key="`${event.event}-${event.createdAt}`" :event="event" />
      <AdminListRow v-if="!recent.length" as="li" class="text-center text-fg-muted">{{ t("noRecentEvents") }}</AdminListRow>
    </ul>
  </AdminSection>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import AdminEventRow from "@/features/admin/ui/AdminEventRow.vue";
import AdminListRow from "@/features/admin/ui/AdminListRow.vue";
import AdminSection from "@/features/admin/ui/AdminSection.vue";
import { useAdminOverviewStore } from "@/features/admin/dashboard/adminOverview";
import { useI18n } from "@/shared/i18n/useI18n";

// The dashboard only previews the trail, the whole of it is on the diagnostics page.
const PREVIEW = 5;

const { t } = useI18n();
const { overview } = useAdminOverviewStore();
const recent = computed(() => overview.recentEvents.slice(0, PREVIEW));
</script>

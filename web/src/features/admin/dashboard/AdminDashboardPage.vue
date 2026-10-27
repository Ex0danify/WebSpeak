<template>
  <AdminPage :title="t('dashboard')">
    <StatusBanner />
    <Metrics class="grid-cols-2 gap-3 desktop:grid-cols-4" />
    <div class="grid items-start gap-4 medium:grid-cols-2">
      <component :is="card.component" v-for="card in cards" :key="card.id" :class="card.class" v-bind="card.props" />
    </div>
  </AdminPage>
</template>

<script setup lang="ts">
import AdminPage from "@/features/admin/ui/AdminPage.vue";
import { adminSiblings } from "@/features/admin/core/adminSiblings";
import { useLiveRefresh } from "@/features/admin/core/useLiveRefresh";
import type { AdminPageCard } from "@/features/admin/ui/adminPage";
import Metrics from "@/features/admin/dashboard/Metrics.vue";
import EventLogCard from "@/features/admin/events/EventLogCard.vue";
import ServerHealthCard from "@/features/admin/dashboard/ServerHealthCard.vue";
import StatusBanner from "@/features/admin/dashboard/StatusBanner.vue";
import { useI18n } from "@/shared/i18n/useI18n";

const { t } = useI18n();
useLiveRefresh(() => adminSiblings().loadOverview(), 5000);

const cards: AdminPageCard[] = [
  { id: "serverHealth", component: ServerHealthCard },
  { id: "events", component: EventLogCard, props: { limit: 5 } },
];
</script>

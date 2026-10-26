<template>
  <AdminPage :title="t('dashboard')">
    <StatusBanner />
    <Metrics class="grid-cols-3 gap-3 max-desktop:gap-1.75" />
    <div class="grid items-start gap-4 medium:grid-cols-2">
      <component :is="card.component" v-for="card in cards" :key="card.id" :class="card.class" />
    </div>
  </AdminPage>
</template>

<script setup lang="ts">
import AdminPage from "@/features/admin/ui/AdminPage.vue";
import type { AdminPageCard } from "@/features/admin/ui/adminPage";
import Metrics from "@/features/admin/dashboard/Metrics.vue";
import RecentEventsCard from "@/features/admin/dashboard/RecentEventsCard.vue";
import ServerHealthCard from "@/features/admin/dashboard/ServerHealthCard.vue";
import StatusBanner from "@/features/admin/dashboard/StatusBanner.vue";
import { useI18n } from "@/shared/i18n/useI18n";

const { t } = useI18n();

const cards: AdminPageCard[] = [
  { id: "serverHealth", component: ServerHealthCard },
  { id: "recentEvents", component: RecentEventsCard },
];
</script>

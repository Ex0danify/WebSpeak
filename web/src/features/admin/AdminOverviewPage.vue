<template>
  <section :class="adminPage">
    <StatusBanner class="shrink-0" />
    <Metrics class="my-3.5 shrink-0 grid-cols-3 gap-3 max-desktop:my-2.5 max-desktop:gap-1.75" />
    <div class="grid min-h-0 flex-1 grid-cols-1 items-stretch gap-3.5 desktop:grid-cols-[1.05fr_.95fr]">
      <component :is="card.component" v-for="card in cards" :key="card.id" v-bind="card.props" :class="card.class" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { adminPage, type AdminPageCard } from "@/features/admin/adminPage";
import Metrics from "@/features/admin/overview/Metrics.vue";
import RecentEventsCard from "@/features/admin/overview/RecentEventsCard.vue";
import ServerHealthCard from "@/features/admin/overview/ServerHealthCard.vue";
import StatusBanner from "@/features/admin/overview/StatusBanner.vue";

// The event list is the one that scrolls: it fills the height the server list leaves and scrolls inside.
const cards: AdminPageCard[] = [
  { id: "serverHealth", component: ServerHealthCard, class: "desktop:self-start" },
  {
    id: "recentEvents",
    component: RecentEventsCard,
    class: "h-full min-h-0 overflow-hidden max-desktop:h-auto max-desktop:overflow-visible",
    props: {
      bodyClass: "flex min-h-0 flex-col",
      listClass: "min-h-0 flex-auto overflow-y-auto max-desktop:overflow-visible",
    },
  },
];
</script>

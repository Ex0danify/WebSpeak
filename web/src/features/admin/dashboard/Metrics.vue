<template>
  <div class="grid">
    <Card v-for="metric in metrics" :key="metric.label" as="article" padding="sm" class="relative">
      <span
        class="absolute top-4.25 right-4.25 grid size-8.75 place-items-center rounded-md bg-surface-2 text-accent max-desktop:top-2.5 max-desktop:right-2.5 max-desktop:size-7"
        ><Icon :name="metric.icon" :size="20"
      /></span>
      <small class="block text-2xs text-fg-muted max-desktop:pr-8">{{ metric.label }}</small>
      <strong class="mt-3.25 block max-w-4/5 truncate text-xl max-desktop:mt-2.25 max-desktop:text-md">{{ metric.value }}</strong>
      <RouterLink v-if="metric.to" :to="metric.to" class="mt-1.75 block text-2xs font-bold text-accent no-underline">{{
        metric.note
      }}</RouterLink>
      <em v-else class="mt-1.75 block text-2xs text-fg-muted not-italic">{{ metric.note }}</em>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { Card } from "@/shared/ui/card";
import { Icon, type IconName } from "@/shared/ui/icon";
import { createAdminFormat } from "@/features/admin/core/adminFormat";
import { useAdminOverviewStore } from "@/features/admin/dashboard/adminOverview";
import { useI18n } from "@/shared/i18n/useI18n";

// The page arranges the cards, `class` is the grid.
const { language, t } = useI18n();
const { overview } = useAdminOverviewStore();
const { formatUptime } = createAdminFormat(language, t);

const reachableCount = computed(() => overview.servers.filter((server) => server.status === "reachable").length);

interface Metric {
  icon: IconName;
  label: string;
  value: string;
  note: string;
  /** Turns the note into a link to the page that manages the thing counted. */
  to?: string;
}

const metrics = computed<Metric[]>(() => [
  { icon: "activity", label: t("gateway"), value: overview.gateway.version || "—", note: formatUptime(overview.gateway.uptimeSeconds) },
  {
    icon: "server",
    label: t("teamSpeakServers"),
    value: String(overview.servers.length),
    note: t("serversReachable", { reachable: reachableCount.value, total: overview.servers.length }),
  },
  {
    icon: "users",
    label: t("activeSessions"),
    value: `${overview.sessions.active} / ${overview.sessions.limit}`,
    note: t("peakSessions", { count: overview.sessions.peak }),
  },
  {
    icon: "share",
    label: t("activeInvites"),
    value: String(overview.invites.active),
    note: t("manageInvites"),
    to: "/admin/users/invites",
  },
]);
</script>

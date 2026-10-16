<template>
  <section :class="adminPage">
    <div
      class="flex shrink-0 items-center justify-between rounded-lg bg-accent-soft p-6 text-fg max-desktop:items-start max-desktop:gap-5 max-desktop:p-4.5"
    >
      <div>
        <small class="text-2xs font-extrabold tracking-label text-fg-muted">{{ t("systemStatus") }}</small>
        <h2 class="mt-2.25 mb-1.25 text-2xl font-bold">{{ t("everythingRunning") }}</h2>
        <p class="m-0 text-xs text-fg-muted max-desktop:max-w-3/4">{{ t("overviewLead") }}</p>
      </div>
      <Chip variant="success" dot class="max-narrow:hidden">{{ t("running") }}</Chip>
    </div>
    <div class="my-3.5 grid shrink-0 grid-cols-3 gap-3 max-desktop:my-2.5 max-desktop:gap-1.75">
      <Card v-for="metric in metrics" :key="metric.icon" as="article" padding="sm" class="relative">
        <span
          class="absolute top-4.25 right-4.25 grid size-8.75 place-items-center rounded-md bg-surface-2 text-accent max-desktop:top-2.5 max-desktop:right-2.5 max-desktop:size-7"
          ><Icon :name="metric.icon" :size="20"
        /></span>
        <small class="block text-2xs text-fg-muted">{{ metric.label }}</small>
        <strong class="mt-3.25 block max-w-4/5 truncate text-xl max-desktop:mt-2.25 max-desktop:text-md">{{ metric.value }}</strong>
        <em class="mt-1.75 block text-2xs text-fg-muted not-italic">{{ metric.note }}</em>
      </Card>
    </div>
    <div class="grid min-h-0 flex-1 grid-cols-1 items-stretch gap-3.5 desktop:grid-cols-[1.05fr_.95fr]">
      <Card as="article" flush :class="cn(cardPad, 'desktop:self-start')">
        <header class="flex justify-between">
          <div>
            <h3 class="m-0 text-md font-bold">{{ t("targetHealth") }}</h3>
            <p class="mt-1.25 mb-0 text-2xs text-fg-muted">{{ t("targetHealthLead") }}</p>
          </div>
          <RouterLink to="/admin/server" class="text-caption font-bold text-accent no-underline">{{ t("manage") }}</RouterLink>
        </header>
        <dl class="m-0 mt-4.5 grid grid-cols-2 gap-3.5">
          <div class="rounded-md bg-surface-0 p-3.25">
            <dt class="text-2xs text-fg-muted">{{ t("status") }}</dt>
            <dd class="m-0 mt-1.25 flex items-center gap-1.75 text-xs font-bold">
              <i class="size-1.75 rounded-full" :class="statusDot"></i>{{ targetStatusText }}
            </dd>
          </div>
          <div class="rounded-md bg-surface-0 p-3.25">
            <dt class="text-2xs text-fg-muted">{{ t("lastTest") }}</dt>
            <dd class="m-0 mt-1.25 flex items-center gap-1.75 text-xs font-bold">{{ formatDate(overview.teamSpeak.lastTestAt) }}</dd>
          </div>
          <div class="rounded-md bg-surface-0 p-3.25">
            <dt class="text-2xs text-fg-muted">{{ t("latency") }}</dt>
            <dd class="m-0 mt-1.25 flex items-center gap-1.75 text-xs font-bold">
              {{ overview.teamSpeak.latencyMs == null ? "—" : `${overview.teamSpeak.latencyMs} ms` }}
            </dd>
          </div>
        </dl>
      </Card>
      <article
        :class="
          cn(
            'flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-surface-1 max-desktop:h-auto max-desktop:overflow-visible',
            cardPad,
          )
        "
      >
        <header class="flex justify-between">
          <div>
            <h3 class="m-0 text-md font-bold">{{ t("recentEvents") }}</h3>
            <p class="mt-1.25 mb-0 text-2xs text-fg-muted">{{ t("recentEventsLead") }}</p>
          </div>
        </header>
        <ul class="m-0 mt-4.5 grid min-h-0 flex-auto list-none content-start gap-2.5 overflow-y-auto p-0 max-desktop:overflow-visible">
          <li
            v-for="event in overview.recentEvents"
            :key="`${event.event}-${event.createdAt}`"
            :class="cn('flex items-center gap-2.5', eventRow)"
          >
            <span class="grid size-6.75 place-items-center rounded-md bg-accent-soft text-accent"><Icon name="check" :size="14" /></span>
            <div>
              <strong class="block text-caption">{{ eventName(event.event) }}</strong
              ><small class="mt-0.75 block text-2xs text-fg-muted">{{ formatDate(event.createdAt) }}</small>
            </div>
          </li>
          <li v-if="!overview.recentEvents.length" :class="cn('block text-center text-fg-muted', eventRow)">{{ t("noRecentEvents") }}</li>
        </ul>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { adminPage } from "@/features/admin/adminPage";
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { Card } from "@/shared/ui/card";
import { Chip } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { cn } from "@/shared/lib/cn";
import { createAdminFormat } from "@/features/admin/adminFormat";
import { useAdminOverviewStore } from "@/features/admin/adminOverview";
import { useI18n } from "@/shared/i18n/useI18n";

const { language, t } = useI18n();
const { overview } = useAdminOverviewStore();
const targetStatusText = computed(() =>
  overview.teamSpeak.status === "reachable"
    ? t("reachable")
    : overview.teamSpeak.status === "unreachable"
      ? t("unreachable")
      : t("notTested"),
);
const { formatDate, formatUptime, eventName } = createAdminFormat(language, t);

const metrics = computed(
  () =>
    [
      { icon: "activity", label: t("gateway"), value: overview.gateway.version || "—", note: formatUptime(overview.gateway.uptimeSeconds) },
      { icon: "server", label: t("teamSpeakTarget"), value: overview.teamSpeak.target || "—", note: targetStatusText.value },
      {
        icon: "users",
        label: t("activeSessions"),
        value: `${overview.sessions.active} / ${overview.sessions.limit}`,
        note: t("peakSessions", { count: overview.sessions.peak }),
      },
    ] as const,
);
const statusDot = computed(() =>
  overview.teamSpeak.status === "reachable" ? "bg-success" : overview.teamSpeak.status === "unreachable" ? "bg-danger" : "bg-line-strong",
);
// Padding of the two overview cards (the Card is flush, so it is set on the root).
const cardPad = "p-6 max-narrow:p-4.5";
const eventRow = "rounded-md bg-surface-0 p-2.5";
</script>

<template>
  <Popover v-model:open="open" side="bottom" align="end" :label="t('eventLog')" class="w-90">
    <template #trigger>
      <Button variant="ghost" size="sm" icon-only :class="triggerClass" :aria-label="triggerLabel" :title="t('eventLog')">
        <Icon name="bell" />
        <span
          v-if="unreadCount"
          class="absolute top-0.5 right-0.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-2xs leading-4 font-bold text-accent-fg"
          aria-hidden="true"
          >{{ unreadCount > 99 ? "99+" : unreadCount }}</span
        >
      </Button>
    </template>
    <header class="flex items-baseline justify-between gap-3">
      <strong class="text-ui">{{ t("eventLog") }}</strong>
      <small class="text-2xs text-fg-muted">{{ t("eventCount", { count: events.length }) }}</small>
    </header>
    <ol v-if="events.length" class="mt-2 max-h-80 overflow-y-auto" :aria-label="t('eventLog')">
      <li
        v-for="event in shown"
        :key="event.id"
        class="flex items-baseline gap-3 border-b border-line py-2 text-xs leading-snug text-fg-muted last:border-b-0"
      >
        <time class="flex-none text-2xs">{{ formatTime(event.timestamp) }}</time
        ><span>{{ eventText(event) }}</span>
      </li>
    </ol>
    <div v-else class="mt-2 flex flex-col items-center py-6 text-center text-fg-muted">
      <strong class="text-md">{{ t("noEvents") }}</strong
      ><span class="mt-1.25 text-ui">{{ t("noEventsLead") }}</span>
    </div>
  </Popover>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Popover } from "@/shared/ui/popover";
import { useI18n } from "@/shared/i18n/useI18n.js";
import type { ServerEvent } from "@/features/session";

const props = defineProps<{
  events: ServerEvent[];
  eventText: (event: ServerEvent) => string;
  formatTime: (timestamp: number) => string;
}>();

const { t } = useI18n();

const open = ref(false);
// Events that were already there when the room opened are not news.
const lastSeenId = ref(props.events.at(-1)?.id ?? "");

const unreadCount = computed(() => {
  if (open.value) return 0;
  const index = props.events.findIndex((event) => event.id === lastSeenId.value);
  return props.events.length - (index + 1);
});

const triggerLabel = computed(() => (unreadCount.value ? t("eventLogUnread", { count: unreadCount.value }) : t("eventLog")));
// Newest first, the popover is a glance at what just happened.
const shown = computed(() => [...props.events].reverse());

watch([open, () => props.events.length], () => {
  if (open.value) lastSeenId.value = props.events.at(-1)?.id ?? "";
});

const triggerClass = "relative shrink-0 text-fg-muted hover:text-accent max-compact:size-9 max-phone:size-8";
</script>

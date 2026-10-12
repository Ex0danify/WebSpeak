<template>
  <div class="max-w-157.5">
    <div class="flex items-center gap-2.25 text-xs leading-normal font-bold tracking-eyebrow text-accent uppercase">
      <span class="size-2.25 rounded-full bg-success"></span> {{ t("privateAudio") }}
    </div>
    <h1
      class="mt-5 mb-4.5 text-display leading-[1.04] font-bold tracking-display text-fg max-compact:my-3.5 max-compact:text-display-compact"
    >
      {{ t("joinLine1") }}<br /><em class="inline-block text-accent not-italic">{{ t("joinLine2") }}</em>
    </h1>
    <p class="m-0 max-w-125 text-lg leading-[1.75] text-fg-muted max-compact:text-ui max-compact:leading-[1.65]">{{ welcomeText }}</p>
    <div class="mt-10.5 flex flex-wrap gap-6 max-compact:mt-5.75 max-compact:gap-3.25 max-phone-lg:grid max-phone-lg:grid-cols-1">
      <div class="flex min-w-40 items-center gap-2.5 max-compact:min-w-0 max-compact:flex-1 max-compact:basis-3/10">
        <span class="grid size-8.5 place-items-center rounded-lg bg-accent-soft text-accent"><Icon name="waveform" :size="16" /></span>
        <span>
          <b class="block text-ui font-bold text-fg">{{ t("highQuality") }}</b>
          <small class="mt-0.75 block text-caption text-fg-muted max-compact:hidden max-phone-lg:block">{{ t("opusAudio") }}</small>
        </span>
      </div>
      <div class="flex min-w-40 items-center gap-2.5 max-compact:min-w-0 max-compact:flex-1 max-compact:basis-3/10">
        <span class="grid size-8.5 place-items-center rounded-lg bg-success-soft text-success"><Icon name="shield" :size="16" /></span>
        <span>
          <b class="block text-ui font-bold text-fg">{{ t("secureJoin") }}</b>
          <small class="mt-0.75 block text-caption text-fg-muted max-compact:hidden max-phone-lg:block">{{ t("inviteProtected") }}</small>
        </span>
      </div>
      <div class="flex min-w-40 items-center gap-2.5 max-compact:min-w-0 max-compact:flex-1 max-compact:basis-3/10">
        <span class="grid size-8.5 place-items-center rounded-lg bg-warning-soft text-warning"><Icon name="users" :size="16" /></span>
        <span>
          <b class="block text-ui font-bold text-fg">{{ t("realtime") }}</b>
          <small class="mt-0.75 block text-caption text-fg-muted max-compact:hidden max-phone-lg:block">{{ t("membersSync") }}</small>
        </span>
      </div>
    </div>
    <Chip
      v-if="visitorNumber !== null"
      variant="highlight"
      size="hero"
      class="mt-7.5 w-fit max-compact:mt-6"
      role="status"
      aria-live="polite"
    >
      <template #icon
        ><span class="grid size-6.75 shrink-0 place-items-center rounded-full bg-accent text-accent-fg ring-4 ring-accent/12"
          ><Icon name="users" :size="15" /></span
      ></template>
      <span class="flex min-w-0 items-center gap-2.5">
        <span class="min-w-0 truncate">{{ t("visitorCount", { count: visitorNumber }) }}</span>
        <Separator v-if="visitorTotal !== null" orientation="vertical" class="h-4.5 self-auto" />
        <span v-if="visitorTotal !== null" class="min-w-0 truncate text-sm font-semibold opacity-78">{{
          t("visitorTotal", { count: visitorTotal })
        }}</span>
        <span class="animate-visitor-spark text-md leading-none text-accent motion-reduce:animate-none" aria-hidden="true">✦</span>
      </span>
    </Chip>
  </div>
</template>

<script setup lang="ts">
import { Chip } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { Separator } from "@/shared/ui/separator";
import { useI18n } from "@/shared/i18n/useI18n.js";

defineProps<{
  welcomeText: string;
  visitorNumber: number | null;
  visitorTotal: number | null;
}>();

const { t } = useI18n();
</script>

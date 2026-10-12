<template>
  <div
    class="flex min-h-47.5 items-center justify-between overflow-hidden rounded-lg bg-linear-112 from-accent-soft to-surface-0 px-7.25 py-6.5 max-demo:min-h-42.5 max-demo:p-5"
  >
    <div>
      <Chip variant="success" dot>{{ t("simulated") }}</Chip>
      <h1 class="mt-4.25 mb-1.75 flex items-center gap-2 text-3xl font-bold tracking-brand text-fg max-phone-xs:text-2xl">
        <Icon name="volume" :size="24" /> {{ channel.name }}
      </h1>
      <p class="mb-3.75 text-xs text-fg-muted max-phone-xs:text-caption">{{ t("heroLead") }}</p>
      <small class="flex items-center gap-1.5 text-caption text-fg-muted"
        ><Icon name="users" :size="14" /> {{ channel.members.length }} {{ t("demoOnline") }}</small
      >
    </div>
    <div class="flex h-15 items-center gap-1.25 pr-5.5 max-demo:origin-right max-demo:scale-75 max-demo:pr-0" aria-hidden="true">
      <i
        v-for="(bar, index) in bars"
        :key="bar"
        :class="['w-1 rounded-sm', (index + 1) % 3 === 0 ? 'bg-success' : 'bg-accent']"
        :style="{ height: `${bar}px` }"
      ></i>
    </div>
  </div>
  <div class="mt-7.75 mb-3.75 grid gap-1.25">
    <span :class="demoKicker">{{ t("voiceActivity") }}</span
    ><strong class="text-xl font-bold text-fg">{{ t("speakingNow") }}</strong>
  </div>
  <div class="grid grid-cols-[repeat(auto-fill,minmax(125px,1fr))] gap-2.75 max-phone-xs:grid-cols-2">
    <article
      v-for="member in channel.members"
      :key="member.id"
      :class="[
        'grid cursor-pointer justify-items-center gap-1.75 rounded-lg border bg-surface-1 px-2 py-3.75',
        speakingId === member.id ? 'border-success ring-2 ring-success/20' : 'border-line',
      ]"
      @click="emit('update:speakingId', member.id)"
    >
      <Avatar :name="member.name" size="xl" /><strong class="text-xs text-fg">{{ member.name }}</strong
      ><span :class="['text-2xs', speakingId === member.id ? 'text-success' : 'text-fg-muted']">{{
        speakingId === member.id ? t("speaking") : t("connected")
      }}</span>
    </article>
  </div>
</template>

<script setup lang="ts">
import { Avatar } from "@/shared/ui/avatar";
import { Chip } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n";
import { demoKicker } from "./demoPanel";
import type { DemoChannel } from "./demoTypes";

defineProps<{ channel: DemoChannel; speakingId: string }>();
const emit = defineEmits<{ "update:speakingId": [id: string] }>();
const { t } = useI18n();
const bars = [15, 31, 21, 42, 25, 50, 32, 21, 38, 27, 45, 18, 33];
</script>

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
    <ul
      class="m-0 mt-10.5 grid list-none grid-cols-2 gap-x-8 gap-y-5 p-0 max-compact:mt-6 max-compact:gap-x-4 max-compact:gap-y-4 max-phone-lg:grid-cols-1"
    >
      <li v-for="feature in features" :key="feature.title" class="flex items-start gap-3">
        <span :class="['flex size-9 shrink-0 items-center justify-center gap-px rounded-lg', feature.tint]">
          <Icon v-for="icon in feature.icons" :key="icon" :name="icon" :size="feature.icons.length > 1 ? 14 : 16" />
        </span>
        <span>
          <b class="block text-ui font-bold text-fg">{{ feature.title }}</b>
          <small class="mt-0.75 block text-caption leading-snug text-fg-muted">{{ feature.text }}</small>
        </span>
      </li>
    </ul>
    <p v-if="visitorNumber !== null" class="m-0 mt-8 flex items-center gap-1.5 text-caption text-fg-muted max-compact:mt-6">
      <Icon name="users" :size="13" />
      <span>{{ t("visitorCount", { count: visitorNumber }) }}</span>
      <template v-if="visitorTotal !== null">
        <span class="text-line-strong" aria-hidden="true">·</span>
        <span>{{ t("visitorTotal", { count: visitorTotal }) }}</span>
      </template>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Icon, type IconName } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n.js";

defineProps<{
  welcomeText: string;
  visitorNumber: number | null;
  visitorTotal: number | null;
}>();

const { t } = useI18n();

const features = computed<{ title: string; text: string; icons: IconName[]; tint: string }[]>(() => [
  { title: t("featureScreenShare"), text: t("featureScreenShareText"), icons: ["monitor"], tint: "bg-accent-soft text-accent" },
  { title: t("featureTeamSpeak"), text: t("featureTeamSpeakText"), icons: ["globe"], tint: "bg-success-soft text-success" },
  { title: t("featureTalkChat"), text: t("featureTalkChatText"), icons: ["headset", "message"], tint: "bg-warning-soft text-warning" },
  { title: t("featureNoInstall"), text: t("featureNoInstallText"), icons: ["download"], tint: "bg-surface-2 text-fg" },
]);
</script>

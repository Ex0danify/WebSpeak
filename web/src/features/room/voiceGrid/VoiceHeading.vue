<template>
  <div class="flex items-end justify-between gap-5 max-compact:gap-2.5">
    <div>
      <span class="text-ui font-bold tracking-kicker text-fg-muted">{{ t("voiceActivity") }}</span>
      <h2 class="mt-1.5 flex items-center gap-1.75 text-2xl font-bold tracking-brand text-fg max-compact:text-xl">
        {{ t("speakingNow") }}
      </h2>
    </div>
    <span class="text-ui text-fg-muted max-phone-lg:hidden">{{ t("onlineShort", { count }) }}</span>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "@/shared/i18n/useI18n.js";

defineProps<{
  count: number;
}>();

const { t } = useI18n();
</script>

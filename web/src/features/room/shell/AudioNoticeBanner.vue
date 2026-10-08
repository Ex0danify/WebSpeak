<template>
  <Banner
    v-if="audioNotice"
    variant="warning"
    :title="t('audioStatus')"
    class="mx-auto mt-3.5 w-[min(950px,calc(100%-64px))] max-[740px]:w-[calc(100%-30px)]"
  >
    {{ resolveText(audioNotice) }}
  </Banner>
</template>

<script setup lang="ts">
import { Banner } from "@/shared/ui/banner";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { resolveText, type MaybeLocalizedText } from "@/shared/i18n/localizedText.js";

defineProps<{
  audioNotice: MaybeLocalizedText;
}>();

const { t } = useI18n();
</script>

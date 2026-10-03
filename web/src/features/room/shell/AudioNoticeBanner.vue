<template>
  <Banner
    v-if="audioNotice"
    variant="warning"
    :title="t('audioStatus')"
    class="mx-auto mt-3.5 w-[min(950px,calc(100%-64px))] max-[740px]:w-[calc(100%-30px)]"
  >
    {{ localizedAudioNotice(audioNoticeCode, audioNotice) }}
  </Banner>
</template>

<script setup lang="ts">
import { Banner } from "@/shared/ui/banner";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { localizeAudioNotice } from "@/shared/lib/localizeMessage.js";

defineProps<{
  audioNotice: string;
  audioNoticeCode: string;
}>();

const { t, language } = useI18n();

function localizedAudioNotice(code: string, message: string) {
  return localizeAudioNotice(code, message, language.value);
}
</script>

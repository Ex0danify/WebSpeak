<template>
  <Banner
    v-if="audioNotice"
    :variant="variant"
    :title="t('audioStatus')"
    class="mx-auto mt-3.5 w-[min(950px,calc(100%-64px))] max-compact:w-[calc(100%-30px)]"
  >
    {{ resolveText(audioNotice) }}
  </Banner>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Banner } from "@/shared/ui/banner";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { resolveText, type MaybeLocalizedText } from "@/shared/i18n/localizedText.js";

const props = defineProps<{
  audioNotice: MaybeLocalizedText;
  audioNoticeCode: string;
}>();

const variant = computed(() =>
  props.audioNoticeCode === "VOICE_CONNECTING" ? "info" : props.audioNoticeCode === "VOICE_FAILED" ? "danger" : "warning",
);

const { t } = useI18n();
</script>

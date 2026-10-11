<template>
  <Banner
    v-if="reconnecting || reconnectFailed"
    :variant="reconnectFailed ? 'danger' : 'warning'"
    :title="reconnectFailed ? t('reconnectFailed') : t('connectionInterrupted')"
    class="mx-auto mt-3.5 w-[min(950px,calc(100%-64px))] max-compact:w-[calc(100%-30px)]"
  >
    {{ reconnecting ? t('reconnectingAttempt', { attempt: reconnectAttempt }) : resolveText(error) }}
    <template #actions>
      <Button v-if="reconnectFailed" size="sm" variant="outline" @click="$emit('reconnect-now')">{{ t('reconnectNow') }}</Button>
      <Button size="sm" variant="ghost" @click="$emit('disconnect')">{{ t('back') }}</Button>
    </template>
  </Banner>
</template>

<script setup lang="ts">
import { Banner } from "@/shared/ui/banner";
import { Button } from "@/shared/ui/button";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { resolveText, type MaybeLocalizedText } from "@/shared/i18n/localizedText.js";

defineProps<{
  reconnecting: boolean;
  reconnectFailed: boolean;
  reconnectAttempt: number;
  error: MaybeLocalizedText;
}>();

defineEmits<{
  (e: "reconnect-now"): void;
  (e: "disconnect"): void;
}>();

const { t } = useI18n();
</script>

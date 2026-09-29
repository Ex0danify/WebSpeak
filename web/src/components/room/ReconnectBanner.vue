<template>
  <Banner
    v-if="reconnecting || reconnectFailed"
    :variant="reconnectFailed ? 'danger' : 'warning'"
    :title="reconnectFailed ? t('reconnectFailed') : t('connectionInterrupted')"
    class="mx-auto mt-3.5 w-[min(950px,calc(100%-64px))] max-[740px]:w-[calc(100%-30px)]"
  >
    {{ reconnecting ? t('reconnectingAttempt', { attempt: reconnectAttempt }) : localizedMessage(error) }}
    <template #actions>
      <Button v-if="reconnectFailed" size="sm" variant="outline" @click="$emit('reconnect-now')">{{ t('reconnectNow') }}</Button>
      <Button size="sm" variant="ghost" @click="$emit('disconnect')">{{ t('back') }}</Button>
    </template>
  </Banner>
</template>

<script setup lang="ts">
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/use-i18n.js";
import { localizeMessage } from "@/lib/messages.js";

defineProps<{
  reconnecting: boolean;
  reconnectFailed: boolean;
  reconnectAttempt: number;
  error: string;
}>();

defineEmits<{
  (e: "reconnect-now"): void;
  (e: "disconnect"): void;
}>();

const { t, language } = useI18n();

function localizedMessage(message: string) {
  return localizeMessage(message, language.value);
}
</script>

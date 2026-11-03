<template>
  <template v-if="unread">
    <span class="size-2.5 flex-none rounded-full bg-unread" aria-hidden="true"></span>
    <span class="sr-only">{{ t("unreadMessages") }}</span>
  </template>
</template>

<script setup lang="ts">
import { useI18n } from "@/shared/i18n/useI18n.js";

defineProps<{ unread: boolean }>();

const { t } = useI18n();
</script>

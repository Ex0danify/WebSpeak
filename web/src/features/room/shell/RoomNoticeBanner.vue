<template>
  <Banner v-for="notice in notices" :key="notice.code" :variant="notice.variant" :title="resolveText(notice.title)">
    {{ resolveText(notice.text) }}
  </Banner>
</template>

<script setup lang="ts">
import { Banner } from "@/shared/ui/banner";
import { resolveText } from "@/shared/i18n/localizedText.js";
import type { RoomNotice } from "@/features/session";

defineProps<{
  notices: readonly RoomNotice[];
}>();
</script>

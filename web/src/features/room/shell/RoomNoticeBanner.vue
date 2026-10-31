<template>
  <Banner
    v-for="notice in notices"
    :key="notice.code"
    :variant="notice.variant"
    :title="resolveText(notice.title)"
    class="mx-auto mt-3.5 w-[min(950px,calc(100%-64px))] max-compact:w-[calc(100%-30px)]"
  >
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

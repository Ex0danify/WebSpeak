<template>
  <Banner variant="danger" class="mt-2.5">{{ text }}</Banner>
</template>

<script setup lang="ts">
import { Banner } from "@/shared/ui/banner";

defineProps<{
  text: string;
}>();
</script>

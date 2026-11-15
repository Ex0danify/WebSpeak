<template>
  <div class="min-w-0 space-y-1.5 break-words"><ChatNodes :nodes="nodes" /></div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import ChatNodes from "@/features/room/chat/ChatNodes.vue";
import { parseChatMarkdown } from "@/features/room/chat/chatMarkdown";

const props = defineProps<{ text: string }>();

const nodes = computed(() => parseChatMarkdown(props.text));
</script>

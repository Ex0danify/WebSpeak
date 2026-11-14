<script setup lang="ts">
import { nextTick, ref } from "vue";

// Inline text hidden behind a bar until it is activated. The hidden state is a button named by `label`, the text itself is
// not read out. Once revealed it is ordinary content (links inside keep working) and focus moves onto it, so a keyboard or
// screen reader user lands on what they asked for.
defineProps<{ label: string }>();

const revealed = ref(false);
const content = ref<HTMLElement | null>(null);

async function reveal() {
  revealed.value = true;
  await nextTick();
  content.value?.focus();
}
</script>

<template>
  <span v-if="revealed" ref="content" tabindex="-1" class="rounded-xs bg-line-strong/50 px-0.5 outline-offset-2"><slot /></span>
  <button
    v-else
    type="button"
    :aria-label="label"
    class="cursor-pointer rounded-xs bg-line-strong px-0.5 align-baseline text-transparent select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    @click="reveal"
  >
    <span aria-hidden="true"><slot /></span>
  </button>
</template>

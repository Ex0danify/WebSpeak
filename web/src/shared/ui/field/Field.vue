<script setup lang="ts">
import { computed, provide, useId } from "vue";
import { cn } from "../../lib/cn";
import { fieldContextKey } from "./fieldContext";
import Label from "./Label.vue";
import Hint from "./Hint.vue";

// Wraps one control (Input, Select, ...) with a label, a hint and an error.
// The control reads its id, aria-describedby and invalid state from here.
const props = defineProps<{
  label?: string;
  hint?: string;
  /** Error message. Replaces the hint and marks the control invalid. */
  error?: string;
  id?: string;
  class?: string;
}>();

const autoId = useId();
const id = computed(() => props.id ?? `field-${autoId}`);
const messageId = computed(() => `${id.value}-message`);
const invalid = computed(() => Boolean(props.error));
const hasMessage = computed(() => Boolean(props.error || props.hint));

provide(fieldContextKey, {
  id,
  describedBy: computed(() => (hasMessage.value ? messageId.value : undefined)),
  invalid,
});
</script>

<template>
  <div :class="cn('flex min-w-0 flex-col gap-1.5', props.class)">
    <Label v-if="label || $slots.label" :for="id"><slot name="label">{{ label }}</slot></Label>
    <slot />
    <!-- The live region exists before the message does, so screen readers announce a new error. -->
    <div aria-live="polite" class="empty:hidden">
      <Hint v-if="hasMessage" :id="messageId" :invalid="invalid"><slot name="message">{{ error || hint }}</slot></Hint>
    </div>
  </div>
</template>

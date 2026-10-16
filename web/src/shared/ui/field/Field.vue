<script setup lang="ts">
import { computed, provide, useId } from "vue";
import { cn } from "@/shared/lib/cn";
import { fieldContextKey } from "@/shared/ui/field/fieldContext";
import Label from "@/shared/ui/field/Label.vue";
import Hint from "@/shared/ui/field/Hint.vue";

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
    <Label v-if="label || $slots.label" :for="id"
      ><slot name="label">{{ label }}</slot></Label
    >
    <slot />
    <!-- The live region exists before the message does, so screen readers announce a new error. -->
    <div aria-live="polite" class="empty:hidden">
      <Hint v-if="hasMessage" :id="messageId" :invalid="invalid"
        ><slot name="message">{{ error || hint }}</slot></Hint
      >
    </div>
  </div>
</template>

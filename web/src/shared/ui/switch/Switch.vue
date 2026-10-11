<script setup lang="ts">
import { computed, inject } from "vue";
import { SwitchRoot, SwitchThumb } from "reka-ui";
import { cn } from "../../lib/cn";
import { fieldContextKey } from "../field";

// On/off toggle for a setting that applies immediately. Name it with an
// aria-label, or with a <label for> / Field label. State shows in the thumb
// position as well as the track color. Attributes go to the button.
const props = withDefaults(defineProps<{ id?: string; disabled?: boolean; class?: string }>(), { disabled: false });

const model = defineModel<boolean>({ default: false });
const field = inject(fieldContextKey, null);
const switchId = computed(() => props.id ?? field?.id.value);
</script>

<template>
  <SwitchRoot
    v-model="model"
    :id="switchId"
    :aria-describedby="field?.describedBy.value"
    :disabled="disabled"
    :class="
      cn(
        'group relative box-border inline-block h-6 w-10 shrink-0 cursor-pointer rounded-full border-0 bg-line-strong p-0 transition-colors motion-reduce:transition-none',
        'max-compact:h-11 max-compact:w-[76px]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'aria-checked:bg-accent disabled:cursor-not-allowed disabled:opacity-50',
        props.class,
      )
    "
  >
    <SwitchThumb
      aria-hidden="true"
      class="absolute left-[3px] top-[3px] size-[18px] rounded-full bg-surface-1 shadow-sm transition-transform motion-reduce:transition-none group-aria-checked:translate-x-4 group-aria-checked:bg-accent-fg max-compact:size-[38px] max-compact:group-aria-checked:translate-x-8"
    />
  </SwitchRoot>
</template>

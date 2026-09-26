<script setup lang="ts">
import { computed, inject, ref } from "vue";
import { cn } from "@/lib/utils";
import { controlVariants } from "../input";
import { fieldContextKey } from "../field";

// Multi-line text with the shared control look. Attributes (rows, maxlength,
// placeholder, disabled, ...) go to the <textarea>; `class` styles the wrapper,
// `textareaClass` the textarea itself. Vertical resize only.
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    invalid?: boolean;
    id?: string;
    class?: string;
    textareaClass?: string;
  }>(),
  { invalid: false },
);

const model = defineModel<string>();
const field = inject(fieldContextKey, null);
const textareaEl = ref<HTMLTextAreaElement | null>(null);

const isInvalid = computed(() => props.invalid || Boolean(field?.invalid.value));
const textareaId = computed(() => props.id ?? field?.id.value);
const describedBy = computed(() => field?.describedBy.value);

defineExpose({ focus: () => textareaEl.value?.focus(), el: textareaEl });
</script>

<template>
  <div :class="cn('relative min-w-0', props.class)">
    <textarea
      v-bind="$attrs"
      :id="textareaId"
      ref="textareaEl"
      v-model="model"
      :aria-invalid="isInvalid ? 'true' : undefined"
      :aria-describedby="describedBy"
      :class="cn(controlVariants({ invalid: isInvalid }), 'h-auto resize-y py-2.5 leading-normal', textareaClass)"
    ></textarea>
  </div>
</template>

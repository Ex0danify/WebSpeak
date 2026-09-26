<script setup lang="ts">
import { computed, inject, ref } from "vue";
import { cn } from "@/lib/utils";
import { controlVariants } from "./input";
import { fieldContextKey } from "../field";

// Attributes (placeholder, autocomplete, disabled, ...) go to the <input>.
// `class` styles the wrapper; use `inputClass` for the input itself.
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    type?: string;
    invalid?: boolean;
    id?: string;
    class?: string;
    inputClass?: string;
  }>(),
  { type: "text", invalid: false },
);

// v-model.trim and v-model.number behave as on a native input.
const [model, modifiers] = defineModel<string | number, "trim" | "number">({
  set(value) {
    if (typeof value !== "string") return value;
    const text = modifiers.trim ? value.trim() : value;
    if (!modifiers.number) return text;
    const number = parseFloat(text);
    return Number.isNaN(number) ? text : number;
  },
});
const field = inject(fieldContextKey, null);
const inputEl = ref<HTMLInputElement | null>(null);

const isInvalid = computed(() => props.invalid || Boolean(field?.invalid.value));
const inputId = computed(() => props.id ?? field?.id.value);
const describedBy = computed(() => field?.describedBy.value);

defineExpose({ focus: () => inputEl.value?.focus(), select: () => inputEl.value?.select(), el: inputEl });
</script>

<template>
  <div :class="cn('relative min-w-0', props.class)">
    <span v-if="$slots.leading" class="pointer-events-none absolute left-3 top-0 flex h-10 items-center text-fg-muted">
      <slot name="leading" />
    </span>
    <input
      v-bind="$attrs"
      :id="inputId"
      ref="inputEl"
      v-model="model"
      :type="type"
      :aria-invalid="isInvalid ? 'true' : undefined"
      :aria-describedby="describedBy"
      :class="cn(controlVariants({ invalid: isInvalid }), $slots.leading && 'pl-[38px]', inputClass)"
    />
  </div>
</template>

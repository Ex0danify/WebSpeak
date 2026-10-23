<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from "vue";
import { cn } from "@/shared/lib/cn";
import { controlVariants } from "@/shared/ui/input/input";
import { fieldContextKey } from "@/shared/ui/field";

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

// Reserve room on the right for trailing content, measured live so typed text never runs under it.
const trailingEl = ref<HTMLElement | null>(null);
const trailingWidth = ref(0);
let observer: ResizeObserver | undefined;
const measure = (): void => void (trailingWidth.value = trailingEl.value?.offsetWidth ?? 0);
const inputStyle = computed(() => (trailingWidth.value ? { paddingRight: `${trailingWidth.value + 20}px` } : undefined));

onMounted(() => {
  if (trailingEl.value && typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(measure);
    observer.observe(trailingEl.value);
    measure();
  }
});
onBeforeUnmount(() => observer?.disconnect());

defineExpose({ focus: () => inputEl.value?.focus(), select: () => inputEl.value?.select(), el: inputEl });
</script>

<template>
  <div :class="cn('relative min-w-0', props.class)">
    <span v-if="$slots.leading" class="pointer-events-none absolute top-0 left-3 flex h-10 items-center text-fg-muted">
      <slot name="leading" />
    </span>
    <input
      v-bind="$attrs"
      :id="inputId"
      ref="inputEl"
      v-model="model"
      :type="type"
      :style="inputStyle"
      :aria-invalid="isInvalid ? 'true' : undefined"
      :aria-describedby="describedBy"
      :class="cn(controlVariants({ invalid: isInvalid }), $slots.leading && 'pl-[38px]', inputClass)"
    />
    <span
      v-if="$slots.trailing"
      ref="trailingEl"
      class="pointer-events-none absolute top-0 right-3 flex h-10 items-center max-compact:h-11"
    >
      <slot name="trailing" />
    </span>
  </div>
</template>

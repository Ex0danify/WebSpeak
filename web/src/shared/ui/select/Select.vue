<script setup lang="ts">
import { computed, inject, ref } from "vue";
import { cn } from "../../lib/cn";
import { Icon } from "../icon";
import { controlVariants } from "../input";
import { fieldContextKey } from "../field";

// A native <select> with the shared control look and a chevron, so the
// platform picker, keyboard handling and mobile wheel all keep working.
// Put <option> elements in the default slot. Attributes go to the <select>;
// `class` styles the wrapper, `selectClass` the select itself.
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    invalid?: boolean;
    id?: string;
    class?: string;
    selectClass?: string;
  }>(),
  { invalid: false },
);

const model = defineModel<string | number>();
const field = inject(fieldContextKey, null);
const selectEl = ref<HTMLSelectElement | null>(null);

const isInvalid = computed(() => props.invalid || Boolean(field?.invalid.value));
const selectId = computed(() => props.id ?? field?.id.value);
const describedBy = computed(() => field?.describedBy.value);

defineExpose({ focus: () => selectEl.value?.focus(), el: selectEl });
</script>

<template>
  <div :class="cn('relative min-w-0', props.class)">
    <select
      v-bind="$attrs"
      :id="selectId"
      ref="selectEl"
      v-model="model"
      :aria-invalid="isInvalid ? 'true' : undefined"
      :aria-describedby="describedBy"
      :class="
        cn(
          controlVariants({ invalid: isInvalid }),
          'peer cursor-pointer appearance-none truncate pr-9 disabled:cursor-not-allowed',
          selectClass,
        )
      "
    >
      <slot />
    </select>
    <span class="pointer-events-none absolute top-0 right-3 flex h-10 items-center text-fg-muted peer-disabled:opacity-50 max-compact:h-11">
      <Icon name="chevron-down" />
    </span>
  </div>
</template>

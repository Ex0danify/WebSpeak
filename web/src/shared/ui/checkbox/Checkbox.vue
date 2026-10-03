<script setup lang="ts">
import { computed, ref } from "vue";
import { CheckboxIndicator, CheckboxRoot } from "reka-ui";
import { cn } from "../../lib/cn";
import { Icon } from "../icon";
import { checkBoxClass, checkRowClass } from "../shared/checkControl";

// Checkbox on reka-ui, in a label. Bind a boolean, or an array together with
// `value` to collect several. Attributes (disabled, name, ...) go to the
// control; `class` styles the label. Give it text in the default slot or an
// aria-label.
defineOptions({ inheritAttrs: false });

const props = defineProps<{ indeterminate?: boolean; value?: unknown; class?: string }>();

const model = defineModel<boolean | unknown[]>({ default: false });
const root = ref<{ $el: HTMLElement } | null>(null);

const state = computed<boolean | "indeterminate">(() => {
  if (props.indeterminate) return "indeterminate";
  return Array.isArray(model.value) ? model.value.includes(props.value) : model.value;
});

function update(next: boolean | "indeterminate") {
  if (Array.isArray(model.value)) {
    const rest = model.value.filter((item) => item !== props.value);
    model.value = next === true ? [...rest, props.value] : rest;
  } else {
    model.value = next === true;
  }
}

defineExpose({ focus: () => root.value?.$el.focus(), el: computed(() => root.value?.$el) });
</script>

<template>
  <label :class="cn(checkRowClass, props.class)">
    <CheckboxRoot
      v-bind="$attrs"
      ref="root"
      :model-value="state"
      :class="cn(checkBoxClass, 'rounded-[4px] data-[state=checked]:bg-accent data-[state=checked]:shadow-[inset_0_0_0_1px_var(--color-accent)] data-[state=indeterminate]:bg-accent data-[state=indeterminate]:shadow-[inset_0_0_0_1px_var(--color-accent)]')"
      @update:model-value="update"
    >
      <CheckboxIndicator class="grid place-content-center">
        <span v-if="state === 'indeterminate'" class="h-0.5 w-2.5 rounded-full bg-accent-fg" />
        <Icon v-else name="check" :size="14" />
      </CheckboxIndicator>
    </CheckboxRoot>
    <span v-if="$slots.default" class="min-w-0"><slot /></span>
  </label>
</template>

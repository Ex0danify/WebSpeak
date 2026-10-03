<script setup lang="ts">
import { computed, inject, ref, watch } from "vue";
import { DropdownMenuItem } from "reka-ui";
import { cn } from "../../lib/cn";
import { Slider } from "../slider";
import { menuContextKey } from "./menuContext";

// A labelled slider row inside a Menu, for a per-item value such as a
// member's volume. `label` is the visible caption and the slider's name; pass
// `valueText` for a spoken value such as "120%".
//
//   <MenuSlider v-model="volume" label="Volume" :min="0" :max="400" :step="5" value-text="120%" />
//
// Reka's menu keeps Tab inside itself and only moves between items, so a bare
// slider could not be reached with the keyboard. On desktop the row is
// therefore an item: arrow keys reach it, Left and Right change the value by
// `keyStep` (default `step`), and Home and End jump to the ends. Pointer use
// works as on any Slider and the row stays open afterwards.
//
// The thumb is drawn but is not a control there: reka's thumb would be a
// second stop in the menu's arrow-key order and would step the value on Up and
// Down while focus moves on. It is marked `data-disabled` and `tabindex="-1"`
// (the menu skips those, and it keeps the thumb out of aria-hidden-focus's
// reach; Slider cannot pass either through as a prop, since reka's thumb
// recomputes both itself on every render, so they are set on the element
// directly) and focus is handed back to the row. In the mobile sheet it is a
// plain Slider, because the sheet is a dialog that tabs normally.
const props = withDefaults(
  defineProps<{
    label: string;
    min?: number;
    max?: number;
    step?: number;
    /** Change per Left or Right press; defaults to `step`. */
    keyStep?: number;
    valueText?: string;
    class?: string;
  }>(),
  { min: 0, max: 100, step: 1 },
);

const model = defineModel<number>({ default: 0 });
const menu = inject(menuContextKey, null);

const rowClass = computed(() => cn("flex w-full flex-col gap-0.5 rounded-sm px-2.5 pb-0.5 pt-1.5 text-sm text-fg outline-none", props.class));

const item = ref<{ $el: HTMLElement } | null>(null);

watch(
  item,
  (row) => {
    const thumb = row?.$el.querySelector("[role=slider]");
    thumb?.setAttribute("data-disabled", "");
    thumb?.setAttribute("tabindex", "-1");
  },
  { flush: "post" },
);

function clamp(value: number) {
  return Math.min(props.max, Math.max(props.min, value));
}

function onKeydown(event: KeyboardEvent) {
  // The slider thumb never keeps focus (see onFocusin), so keys arrive here.
  const step = props.keyStep ?? props.step;
  const delta = event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0;
  if (delta) model.value = clamp(model.value + delta);
  else if (event.key === "Home") model.value = props.min;
  else if (event.key === "End") model.value = props.max;
  else return;
  event.preventDefault();
  event.stopPropagation();
}

// Pressing the track focuses the thumb; keep focus on the row instead.
function onFocusin(event: FocusEvent) {
  if (event.target !== event.currentTarget) item.value?.$el.focus({ preventScroll: true });
}
</script>

<template>
  <div v-if="menu?.sheet.value" role="group" :aria-label="label" :class="cn(rowClass, 'pb-0')">
    <span class="text-xs font-medium text-fg-muted">{{ label }}</span>
    <Slider v-model="model" :min="min" :max="max" :step="step" :value-text="valueText" :aria-label="label" />
  </div>
  <DropdownMenuItem v-else ref="item" :class="cn(rowClass, 'cursor-default data-[highlighted]:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent')" :aria-label="valueText ? `${label}: ${valueText}` : label" @select.prevent @keydown="onKeydown" @focusin="onFocusin">
    <span class="text-xs font-medium text-fg-muted">{{ label }}</span>
    <Slider v-model="model" :min="min" :max="max" :step="step" aria-hidden="true" tabindex="-1" />
  </DropdownMenuItem>
</template>

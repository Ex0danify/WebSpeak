<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from "vue";
import { DropdownMenuItem } from "reka-ui";
import { cn } from "@/shared/lib/cn";
import { Slider } from "@/shared/ui/slider";
import { menuContextKey } from "@/shared/ui/menu/menuContext";

// A labelled slider row inside a Menu, for a per-item value such as a member's volume. `label` is the visible caption and the
// slider's name, `valueText` is for a spoken value such as "120%". `bubble` is the label that rides above the thumb while it is
// dragged or changed by key.

// Reka's menu keeps Tab inside itself, so a bare slider could not be reached by keyboard. On desktop the row is therefore an
// item: arrows reach it, Left and Right change the value by `keyStep` (default `step`), Home and End jump to the ends,
// Enter or Space restores `neutral` when there is one.

// The thumb is drawn but is not a control there, since reka's thumb would be a second stop in the arrow-key order. It gets
// `data-disabled` and `tabindex="-1"` set on the element directly because reka recomputes both on every render, and focus goes
// back to the row.

// The `action` slot puts a small control (such as a mute button) at the end of the label line. It is clicked, not tabbed to, in the
// desktop menu, so give it `tabindex="-1"` there and offer a key on the row instead.

// In the mobile sheet it is a plain Slider, because the sheet is a dialog that tabs normally.
const props = withDefaults(
  defineProps<{
    label: string;
    min?: number;
    max?: number;
    step?: number;
    /** Change per Left or Right press, defaults to `step`. */
    keyStep?: number;
    valueText?: string;
    bubble?: string;
    /** The value that means "unchanged": marked on the slider, snapped to by a drag, and restored by Enter or a double click. */
    neutral?: number;
    class?: string;
  }>(),
  { min: 0, max: 100, step: 1 },
);

const model = defineModel<number>({ default: 0 });
const menu = inject(menuContextKey, null);

const rowClass = computed(() =>
  cn("flex w-full flex-col gap-0.5 rounded-sm px-2.5 pb-0.5 pt-1.5 text-sm text-fg outline-none", props.class),
);

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

// Arrow keys change the value with the thumb out of focus, so the bubble is shown for a moment after each press.
const keying = ref(false);
let keyingTimer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(keyingTimer));

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
  else if ((event.key === "Enter" || event.key === " ") && props.neutral !== undefined) model.value = props.neutral;
  else return;
  keying.value = true;
  clearTimeout(keyingTimer);
  keyingTimer = setTimeout(() => (keying.value = false), 900);
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
    <div class="flex items-center justify-between gap-2">
      <span class="text-xs font-medium text-fg-muted">{{ label }}</span>
      <slot name="action" />
    </div>
    <Slider
      v-model="model"
      :min="min"
      :max="max"
      :step="step"
      :value-text="valueText"
      :bubble="bubble"
      :neutral="neutral"
      :aria-label="label"
    />
  </div>
  <DropdownMenuItem
    v-else
    ref="item"
    :class="
      cn(
        rowClass,
        'cursor-default focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent data-[highlighted]:bg-surface-2',
      )
    "
    :aria-label="valueText ? `${label}: ${valueText}` : label"
    @select.prevent
    @keydown="onKeydown"
    @focusin="onFocusin"
  >
    <div class="flex items-center justify-between gap-2">
      <span class="text-xs font-medium text-fg-muted">{{ label }}</span>
      <slot name="action" />
    </div>
    <Slider
      v-model="model"
      :min="min"
      :max="max"
      :step="step"
      :bubble="bubble"
      :neutral="neutral"
      :bubble-shown="keying"
      aria-hidden="true"
      tabindex="-1"
    />
  </DropdownMenuItem>
</template>

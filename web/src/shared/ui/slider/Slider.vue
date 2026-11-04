<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from "reka-ui";
import { cn } from "@/shared/lib/cn";
import {
  sliderBubbleClass,
  sliderLevelClass,
  sliderLevelGradient,
  sliderRangeClass,
  sliderRootClass,
  sliderThumbClass,
  sliderTickClass,
  sliderTrackClass,
} from "@/shared/ui/slider/slider";

// Slider for volume, thresholds and similar, on reka-ui. Emits while dragging. Name it with aria-label or aria-labelledby, or
// give it an `id` and a <label for> and the label is linked on mount. `valueText` is for a spoken value such as "70%".
// Attributes go to the thumb (role="slider"), `class` styles the root. `bubble` is a short value label that rides above the
// thumb while it is pressed (or while `bubbleShown` is set); it is decoration, so keep `valueText` for the spoken value.

// `neutral` marks a value that means "unchanged" (0 dB on a volume): a tick under the track, a pointer drag that comes
// close to it lands exactly on it, and a double click or Enter on the thumb resets to it. The tick is decoration. The
// snap is for the pointer only, since with the arrow keys it would trap the thumb next to the value. Enter is the keyboard
// route to the reset, so nothing here is reachable by pointer alone.
// `live` adds a level strip to the track, for a threshold the user sets against a signal (the mic gate). Call `setLevel()`
// with the signal on the slider's own scale (0 to 1 of min..max). It writes a custom property on the strip directly, so a
// 50 Hz audio callback never re-renders Vue. The strip is decoration, print the number elsewhere if it matters.
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    valueText?: string;
    bubble?: string;
    bubbleShown?: boolean;
    neutral?: number;
    live?: boolean;
    /** The thicker track of a live slider, for a neighbour that should line up with it. */
    thick?: boolean;
    id?: string;
    class?: string;
  }>(),
  { min: 0, max: 100, step: 1, disabled: false },
);

const model = defineModel<number>({ default: 0 });

const levelStrip = ref<HTMLElement | null>(null);
function setLevel(share: number) {
  levelStrip.value?.style.setProperty("--level", String(Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : 0));
}
defineExpose({ setLevel });
const values = computed(() => [model.value]);

// How close to the neutral value a drag counts as aiming at it, as a share of the whole range.
const SNAP_SHARE = 0.0075;
const neutralPercent = computed(() =>
  props.neutral === undefined ? undefined : ((props.neutral - props.min) / (props.max - props.min)) * 100,
);
const tickStyle = computed(() => {
  const percent = neutralPercent.value;
  return percent === undefined ? undefined : { left: `calc(${percent}% + ${1 - percent / 50} * var(--spacing-slider-thumb-half))` };
});

function onUpdate(next: number[] | undefined) {
  const value = next?.[0];
  if (value === undefined) return;
  const snapped = pressed.value && props.neutral !== undefined && Math.abs(value - props.neutral) <= (props.max - props.min) * SNAP_SHARE;
  model.value = snapped ? props.neutral! : value;
}

function reset() {
  if (props.neutral !== undefined) model.value = props.neutral;
}

const pressed = ref(false);
const release = () => {
  pressed.value = false;
  window.removeEventListener("pointerup", release);
  window.removeEventListener("pointercancel", release);
};
function press() {
  pressed.value = true;
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);
}

// The thumb is not a labelable element, so `<label for>` cannot name it.
// Point aria-labelledby at that label instead.
const labelledBy = ref<string | undefined>();
onMounted(() => {
  if (!props.id) return;
  const label = document.querySelector<HTMLElement>(`label[for="${CSS.escape(props.id)}"]`);
  if (!label) return;
  label.id ||= `${props.id}-label`;
  labelledBy.value = label.id;
});
onBeforeUnmount(() => {
  labelledBy.value = undefined;
  release();
});
</script>

<template>
  <SliderRoot
    :model-value="values"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    :class="cn(sliderRootClass, props.class)"
    @pointerdown="press"
    @dblclick="reset"
    @update:model-value="onUpdate"
  >
    <SliderTrack :class="cn(sliderTrackClass, (live || thick) && 'h-2')"
      ><SliderRange :class="cn(sliderRangeClass, live && 'bg-accent/30')" /><span
        v-if="live"
        ref="levelStrip"
        aria-hidden="true"
        :class="sliderLevelClass"
        :style="{ backgroundImage: sliderLevelGradient }"
      ></span
    ></SliderTrack>
    <span v-if="tickStyle" aria-hidden="true" :class="sliderTickClass" :style="tickStyle"></span>
    <SliderThumb
      :id="id"
      :aria-labelledby="labelledBy"
      :aria-valuetext="valueText"
      v-bind="$attrs"
      :class="sliderThumbClass"
      @keydown.enter="reset"
      ><span v-if="bubble && (pressed || bubbleShown)" aria-hidden="true" :class="sliderBubbleClass">{{ bubble }}</span></SliderThumb
    >
  </SliderRoot>
</template>

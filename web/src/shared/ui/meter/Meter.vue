<script setup lang="ts">
import { computed, ref } from "vue";
import { cn } from "../../lib/cn";
import { meterFillClass, meterThresholdClass, meterVariants, type MeterVariants } from "./meter";

// Input-level bar, 0 to 1. Two ways to drive it:
//
// - `modelValue` for values that change rarely (a saved level, a demo).
// - `setLevel()` for a live level. It writes the --level custom property on
//   the element directly, so a 50 Hz audio callback never touches Vue state
//   and never re-renders this component or its siblings:
//
//     const meter = ref<InstanceType<typeof Meter> | null>(null);
//     onLevel((rms) => meter.value?.setLevel(rms));
//
// Use one or the other on a given meter. A live meter is aria-hidden, since a
// value that changes 50 times a second cannot be announced: print the number
// beside it (as text) and that is what assistive tech reads. With
// `modelValue` it is a `role="meter"` and needs `label`.
// `threshold` (0 to 1) draws a fixed tick, for the VOX threshold.
const props = defineProps<{
  modelValue?: number;
  threshold?: number;
  size?: MeterVariants["size"];
  /** Accessible name; required with `modelValue`. */
  label?: string;
  /** Spoken value such as "-18 dB". Defaults to a percentage. */
  valueText?: string;
  class?: string;
}>();

const root = ref<HTMLElement | null>(null);

const clamp = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

function setLevel(level: number) {
  root.value?.style.setProperty("--level", String(clamp(level)));
}
defineExpose({ setLevel });

const live = computed(() => props.modelValue === undefined);
const level = computed(() => clamp(props.modelValue ?? 0));
const thresholdStyle = computed(() =>
  props.threshold === undefined ? undefined : { "--threshold": String(clamp(props.threshold)) },
);
</script>

<template>
  <span
    ref="root"
    :class="cn(meterVariants({ size }), props.class)"
    :role="live ? undefined : 'meter'"
    :aria-hidden="live ? true : undefined"
    :aria-label="live ? undefined : label"
    :aria-valuemin="live ? undefined : 0"
    :aria-valuemax="live ? undefined : 1"
    :aria-valuenow="live ? undefined : level"
    :aria-valuetext="live ? undefined : (valueText ?? `${Math.round(level * 100)}%`)"
    :style="live ? undefined : { '--level': String(level) }"
  >
    <span :class="meterFillClass" />
    <span v-if="threshold !== undefined" :class="meterThresholdClass" :style="thresholdStyle" />
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from "reka-ui";
import { cn } from "../../lib/cn";
import { sliderRangeClass, sliderRootClass, sliderThumbClass, sliderTrackClass } from "./slider";

// Slider for volume, thresholds and similar, on reka-ui. Emits while dragging.
// Name it with aria-label or aria-labelledby, or give it an `id` and a
// <label for> and the label is linked when the slider mounts. Pass
// `valueText` for a spoken value such as "70%". Attributes go to the thumb
// (the element with role="slider"); `class` styles the root.
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    valueText?: string;
    id?: string;
    class?: string;
  }>(),
  { min: 0, max: 100, step: 1, disabled: false },
);

const model = defineModel<number>({ default: 0 });
const values = computed(() => [model.value]);

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
onBeforeUnmount(() => (labelledBy.value = undefined));
</script>

<template>
  <SliderRoot
    :model-value="values"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    :class="cn(sliderRootClass, props.class)"
    @update:model-value="model = $event?.[0] ?? model"
  >
    <SliderTrack :class="sliderTrackClass"><SliderRange :class="sliderRangeClass" /></SliderTrack>
    <SliderThumb :id="id" :aria-labelledby="labelledBy" :aria-valuetext="valueText" v-bind="$attrs" :class="sliderThumbClass" />
  </SliderRoot>
</template>

<template>
  <GallerySection id="gallery-meter" title="Meter" note="level · threshold tick · live">
    <div class="flex max-w-xl flex-col gap-6">
      <div class="flex flex-col gap-3">
        <div v-for="level in [0, 0.35, 0.7, 0.85, 1]" :key="level" class="flex items-center gap-3">
          <Meter :model-value="level" :label="meterSamples[lang].input" class="flex-1" />
          <span class="w-10 shrink-0 text-right font-mono text-xs text-fg-muted">{{ Math.round(level * 100) }}%</span>
        </div>
      </div>
      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-3">
          <Meter :model-value="0.55" size="sm" :label="meterSamples[lang].input" class="flex-1" />
          <span class="w-16 shrink-0 font-mono text-xs text-fg-muted">sm</span>
        </div>
        <div class="flex items-center gap-3">
          <Meter :model-value="0.55" size="md" :label="meterSamples[lang].input" class="flex-1" />
          <span class="w-16 shrink-0 font-mono text-xs text-fg-muted">md</span>
        </div>
      </div>
      <div class="flex flex-col gap-2">
        <span class="text-fg-muted">{{ meterSamples[lang].threshold }}</span>
        <Meter :model-value="0.3" :threshold="0.45" :label="meterSamples[lang].threshold" />
        <Meter :model-value="0.8" :threshold="0.45" :label="meterSamples[lang].threshold" />
        <div class="flex justify-between text-xs text-fg-muted">
          <span>{{ meterSamples[lang].silence }}</span>
          <span>{{ meterSamples[lang].loud }}</span>
        </div>
      </div>
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between gap-3">
          <span class="min-w-0 text-fg-muted">{{ meterSamples[lang].live }}</span>
          <span class="font-mono text-xs">{{ livePercent }}%</span>
        </div>
        <Meter ref="liveMeter" />
        <div>
          <Button variant="outline" size="sm" @click="toggleSimulation">
            {{ simulating ? meterSamples[lang].stop : meterSamples[lang].start }}
          </Button>
        </div>
      </div>
    </div>
  </GallerySection>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { Button } from "@/shared/ui/button";
import { Meter } from "@/shared/ui/meter";
import GallerySection from "./GallerySection.vue";
import { type Lang, useGalleryLang } from "./galleryLang";

const lang = useGalleryLang();

const meterSamples: Record<
  Lang,
  { input: string; live: string; threshold: string; start: string; stop: string; silence: string; loud: string }
> = {
  en: {
    input: "Input level",
    live: "Live level",
    threshold: "Voice activation threshold",
    start: "Simulate input",
    stop: "Stop",
    silence: "Silence",
    loud: "Loud",
  },
  de: {
    input: "Eingangspegel des Mikrofons",
    live: "Aktueller Pegel",
    threshold: "Schwellenwert der Sprachaktivierung",
    start: "Eingang simulieren",
    stop: "Stoppen",
    silence: "Stille",
    loud: "Zu laut",
  },
};
const liveMeter = ref<InstanceType<typeof Meter> | null>(null);
const livePercent = ref(0);
const simulating = ref(false);
let frame = 0;
let lastReadout = 0;
// The bar is written straight to the element every frame, only the printed
// percentage is reactive, and it updates ten times a second at most.
function tick(now: number) {
  const level = 0.5 + 0.35 * Math.sin(now / 420) + 0.12 * Math.sin(now / 97);
  liveMeter.value?.setLevel(level);
  if (now - lastReadout > 100) {
    lastReadout = now;
    livePercent.value = Math.round(Math.min(1, Math.max(0, level)) * 100);
  }
  frame = requestAnimationFrame(tick);
}
function toggleSimulation() {
  simulating.value = !simulating.value;
  cancelAnimationFrame(frame);
  if (simulating.value) frame = requestAnimationFrame(tick);
  else {
    liveMeter.value?.setLevel(0);
    livePercent.value = 0;
  }
}
onBeforeUnmount(() => cancelAnimationFrame(frame));
</script>

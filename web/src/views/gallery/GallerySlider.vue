<template>
  <GallerySection id="gallery-slider" title="Slider" note="fill · negative range · disabled">
    <div class="flex max-w-md flex-col gap-5">
      <div class="flex flex-col gap-1">
        <div class="flex items-baseline justify-between gap-3">
          <label for="sl-vol" class="min-w-0 text-ui font-medium">{{ sliderSamples[lang].volume }}</label>
          <span class="font-mono text-ui text-fg-muted">{{ volume }}%</span>
        </div>
        <div class="flex items-center gap-2 text-fg-muted">
          <Icon name="volume" />
          <Slider id="sl-vol" v-model="volume" :value-text="`${volume}%`" />
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <div class="flex items-baseline justify-between gap-3">
          <label for="sl-thr" class="min-w-0 text-ui font-medium">{{ sliderSamples[lang].threshold }}</label>
          <span class="font-mono text-ui text-fg-muted">{{ threshold }} dB</span>
        </div>
        <Slider id="sl-thr" v-model="threshold" :min="-60" :max="0" :step="2" :value-text="`${threshold} decibels`" />
      </div>
      <Slider :model-value="35" disabled aria-label="Disabled" />
    </div>
  </GallerySection>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Slider } from "@/shared/ui/slider";
import { Icon } from "@/shared/ui/icon";
import GallerySection from "./GallerySection.vue";
import { type Lang, useGalleryLang } from "./galleryLang";

const lang = useGalleryLang();

const sliderSamples: Record<Lang, { volume: string; threshold: string }> = {
  en: { volume: "Output volume", threshold: "Voice activity threshold" },
  de: { volume: "Ausgabelautstärke für alle Teilnehmer im Kanal", threshold: "Schwellenwert der Sprachaktivierung" },
  ru: { volume: "Громкость воспроизведения для всех участников канала", threshold: "Порог активации по голосу" },
};
const volume = ref(70);
const threshold = ref(-42);
</script>

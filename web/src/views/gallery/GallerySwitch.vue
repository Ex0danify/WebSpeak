<template>
  <GallerySection id="gallery-switch" title="Switch" note="on · off · disabled">
    <div class="flex max-w-md flex-col gap-4">
      <div class="flex items-center justify-between gap-3">
        <label for="sw-noise" class="min-w-0">
          <span class="block font-medium">{{ switchSamples[lang].noise }}</span>
          <span class="block text-xs leading-4 text-fg-muted">{{ switchSamples[lang].noiseHint }}</span>
        </label>
        <Switch id="sw-noise" v-model="noiseOn" />
      </div>
      <div class="flex items-center justify-between gap-3">
        <label for="sw-ptt" class="min-w-0">
          <span class="block font-medium">{{ switchSamples[lang].ptt }}</span>
          <span class="block text-xs leading-4 text-fg-muted">{{ switchSamples[lang].pttHint }}</span>
        </label>
        <Switch id="sw-ptt" v-model="pttOn" />
      </div>
      <div class="flex items-center gap-3">
        <Switch :model-value="true" disabled aria-label="Disabled on" />
        <Switch :model-value="false" disabled aria-label="Disabled off" />
        <span class="text-fg-muted">noise = {{ noiseOn }} · ptt = {{ pttOn }}</span>
      </div>
    </div>
  </GallerySection>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Switch } from "@/shared/ui/switch";
import GallerySection from "./GallerySection.vue";
import { type Lang, useGalleryLang } from "./galleryLang";

const lang = useGalleryLang();

const switchSamples: Record<Lang, { noise: string; noiseHint: string; ptt: string; pttHint: string }> = {
  en: {
    noise: "Noise suppression",
    noiseHint: "Filters keyboard and fan noise from your mic.",
    ptt: "Push to talk",
    pttHint: "Hold Space to transmit.",
  },
  de: {
    noise: "Geräuschunterdrückung",
    noiseHint: "Filtert Tastatur- und Lüftergeräusche aus dem Mikrofonsignal heraus.",
    ptt: "Push-to-Talk",
    pttHint: "Zum Sprechen die Leertaste gedrückt halten.",
  },
  ru: {
    noise: "Шумоподавление",
    noiseHint: "Убирает шум клавиатуры и вентилятора из сигнала микрофона.",
    ptt: "Нажми и говори",
    pttHint: "Удерживайте пробел, чтобы говорить.",
  },
};
const noiseOn = ref(true);
const pttOn = ref(false);
</script>

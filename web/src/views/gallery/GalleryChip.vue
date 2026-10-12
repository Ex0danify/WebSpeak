<template>
  <GallerySection id="gallery-chip" title="Chip and Count" note="status · icon on warning and danger">
    <div class="flex flex-col gap-5">
      <div class="flex flex-wrap items-center gap-2">
        <Chip variant="success" dot>{{ chipSamples[lang].connected }}</Chip>
        <Chip variant="warning">{{ chipSamples[lang].unstable }}</Chip>
        <Chip variant="danger"
          ><template #icon><Icon name="mic-off" :size="13" /></template>{{ chipSamples[lang].muted }}</Chip
        >
        <Chip variant="accent">{{ chipSamples[lang].ptt }}</Chip>
        <Chip>{{ chipSamples[lang].role }}</Chip
        ><Chip variant="highlight" size="hero">{{ chipSamples[lang].role }}</Chip>
      </div>
      <div class="max-w-[16rem]">
        <Chip variant="warning">{{ chipSamples[lang].long }}</Chip>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <span class="inline-flex items-center gap-2">{{ chipSamples[lang].chat }} <Count>3</Count></span>
        <span class="inline-flex items-center gap-2">{{ chipSamples[lang].chat }} <Count variant="neutral">12</Count></span>
        <span class="inline-flex items-center gap-2"
          >{{ chipSamples[lang].chat }} <Count variant="danger" aria-label="99+ unread">99+</Count></span
        >
      </div>
    </div>
  </GallerySection>
</template>

<script setup lang="ts">
import { Chip, Count } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import GallerySection from "./GallerySection.vue";
import { type Lang, useGalleryLang } from "./galleryLang";

const lang = useGalleryLang();

const chipSamples: Record<
  Lang,
  { connected: string; unstable: string; muted: string; ptt: string; role: string; long: string; chat: string }
> = {
  en: {
    connected: "Connected · 41 ms",
    unstable: "Unstable",
    muted: "Muted",
    ptt: "Push to talk",
    role: "Moderator",
    long: "Connection quality degraded for several minutes",
    chat: "Chat",
  },
  de: {
    connected: "Verbunden · 41 ms",
    unstable: "Instabil",
    muted: "Stummgeschaltet",
    ptt: "Push-to-Talk",
    role: "Moderator",
    long: "Verbindungsqualität seit mehreren Minuten beeinträchtigt",
    chat: "Chat",
  },
};
</script>

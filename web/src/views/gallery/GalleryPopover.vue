<template>
  <GallerySection id="gallery-popover" title="Popover" note="anchored panel · non-modal · Esc">
    <div class="flex flex-wrap items-center gap-4">
      <Popover :label="popoverSamples[lang].label">
        <template #trigger>
          <Button variant="outline"><Icon name="volume" />{{ popoverSamples[lang].trigger }}</Button>
        </template>
        <template #default="{ close }">
          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between gap-3">
              <span class="min-w-0 font-semibold">{{ popoverSamples[lang].volume }}</span>
              <span class="font-mono text-xs text-fg-muted">{{ volume }}%</span>
            </div>
            <Slider v-model="volume" :aria-label="popoverSamples[lang].volume" :value-text="`${volume}%`" />
            <p class="m-0 text-xs text-fg-muted">{{ popoverSamples[lang].hint }}</p>
            <Button size="sm" variant="secondary" class="self-end" @click="close">{{ popoverSamples[lang].done }}</Button>
          </div>
        </template> </Popover
      ><Popover trigger="hover" side="top" :label="popoverSamples[lang].volume"
        ><template #trigger
          ><Button variant="outline" icon-only :aria-label="popoverSamples[lang].volume"><Icon name="volume" /></Button></template
        ><Slider v-model="volume" :aria-label="popoverSamples[lang].volume"
      /></Popover>
      <Button variant="outline" @click="popoverDialog = true">{{ popoverSamples[lang].inDialog }}</Button>
    </div>

    <Dialog v-model="popoverDialog" size="sm" :title="popoverSamples[lang].inDialog" :close-label="closeLabel[lang]">
      <Popover :label="popoverSamples[lang].label">
        <template #trigger>
          <Button variant="outline"><Icon name="volume" />{{ popoverSamples[lang].trigger }}</Button>
        </template>
        <Slider v-model="volume" :aria-label="popoverSamples[lang].volume" />
      </Popover>
    </Dialog>
  </GallerySection>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Button } from "@/shared/ui/button";
import { Slider } from "@/shared/ui/slider";
import { Dialog } from "@/shared/ui/dialog";
import { Popover } from "@/shared/ui/popover";
import { Icon } from "@/shared/ui/icon";
import GallerySection from "./GallerySection.vue";
import { type Lang, useGalleryLang, closeLabel } from "./galleryLang";

const lang = useGalleryLang();

const popoverSamples: Record<Lang, { trigger: string; label: string; volume: string; done: string; hint: string; inDialog: string }> = {
  en: {
    trigger: "Output volume",
    label: "Output volume",
    volume: "Volume",
    done: "Done",
    hint: "Applies to everyone you hear in this tab.",
    inDialog: "Popover inside a dialog",
  },
  de: {
    trigger: "Ausgabelautstärke",
    label: "Ausgabelautstärke für alle Teilnehmer",
    volume: "Lautstärke",
    done: "Fertig",
    hint: "Gilt für alle Teilnehmer, die Sie in diesem Tab hören.",
    inDialog: "Popover in einem Dialog",
  },
};
const volume = ref(70);
const popoverDialog = ref(false);
</script>

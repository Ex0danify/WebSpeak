<template>
  <GallerySection id="gallery-tooltip" title="Tooltip" note="hover · focus · Esc · never interactive">
    <div class="flex flex-wrap items-center gap-4">
      <Tooltip :text="tooltipSamples[lang].mute" shortcut="M">
        <Button variant="outline" icon-only :aria-label="tooltipSamples[lang].mute"><Icon name="mic-off" /></Button>
      </Tooltip>
      <Tooltip :text="tooltipSamples[lang].settings">
        <Button variant="outline" icon-only :aria-label="tooltipSamples[lang].settings"><Icon name="settings" /></Button>
      </Tooltip>
      <Tooltip :text="tooltipSamples[lang].long">
        <Button variant="outline">{{ tooltipSamples[lang].long.slice(0, 24) }}…</Button>
      </Tooltip>
      <Tooltip v-for="side in tooltipSides" :key="side" :text="tooltipSamples[lang].sides[side]" :side="side">
        <Button variant="secondary" size="sm">{{ tooltipSamples[lang].sides[side] }}</Button>
      </Tooltip>
      <Button variant="outline" @click="tooltipDialog = true">{{ tooltipSamples[lang].inDialog }}</Button>
    </div>

    <Dialog v-model="tooltipDialog" size="sm" :title="tooltipSamples[lang].inDialog" :close-label="closeLabel[lang]">
      <Tooltip :text="tooltipSamples[lang].mute" shortcut="M">
        <Button variant="outline" icon-only :aria-label="tooltipSamples[lang].mute"><Icon name="mic-off" /></Button>
      </Tooltip>
    </Dialog>
  </GallerySection>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { Tooltip } from "@/shared/ui/tooltip";
import { Icon } from "@/shared/ui/icon";
import GallerySection from "@/views/gallery/GallerySection.vue";
import { type Lang, useGalleryLang, closeLabel } from "@/views/gallery/galleryLang";

const lang = useGalleryLang();

const tooltipSamples: Record<
  Lang,
  { mute: string; settings: string; long: string; inDialog: string; sides: Record<"top" | "right" | "bottom" | "left", string> }
> = {
  en: {
    mute: "Mute microphone",
    settings: "Audio settings",
    long: "Applies to everyone you hear in this tab, not to other people connected to the server.",
    inDialog: "Tooltip inside a dialog",
    sides: { top: "Top", right: "Right", bottom: "Bottom", left: "Left" },
  },
  de: {
    mute: "Mikrofon stummschalten",
    settings: "Audioeinstellungen",
    long: "Gilt für alle Teilnehmer, die Sie in diesem Tab hören, nicht für andere mit dem Server verbundene Personen.",
    inDialog: "Tooltip in einem Dialog",
    sides: { top: "Oben", right: "Rechts", bottom: "Unten", left: "Links" },
  },
};
const tooltipDialog = ref(false);
const tooltipSides = ["top", "right", "bottom", "left"] as const;
</script>

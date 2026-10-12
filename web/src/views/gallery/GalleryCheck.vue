<template>
  <GallerySection id="gallery-check" title="Checkbox · Radio" note="boolean · array · indeterminate · group">
    <div class="grid gap-6 narrow:grid-cols-2">
      <div class="flex max-w-sm flex-col gap-1">
        <Checkbox v-model="remember">{{ checkSamples[lang].remember }}</Checkbox>
        <Checkbox :model-value="false" disabled>Disabled</Checkbox>
        <Checkbox :model-value="true" disabled>Disabled checked</Checkbox>
        <Checkbox
          :model-value="picked.length === 3 ? true : false"
          :indeterminate="picked.length > 0 && picked.length < 3"
          @update:model-value="picked = $event ? ['lobby', 'raid', 'afk'] : []"
        >
          {{ checkSamples[lang].all }}
        </Checkbox>
        <div class="ml-7 flex flex-col gap-1">
          <Checkbox v-model="picked" value="lobby">Lobby</Checkbox>
          <Checkbox v-model="picked" value="raid">Raid Night</Checkbox>
          <Checkbox v-model="picked" value="afk">AFK</Checkbox>
        </div>
      </div>
      <div class="flex max-w-sm flex-col gap-1">
        <span id="mode-label" class="mb-1 text-ui font-medium">{{ checkSamples[lang].modes }}</span>
        <RadioGroup v-model="mode" aria-labelledby="mode-label">
          <Radio value="ptt">{{ checkSamples[lang].ptt }}</Radio>
          <Radio value="vox">{{ checkSamples[lang].vox }}</Radio>
          <Radio value="always" disabled>{{ checkSamples[lang].always }}</Radio>
        </RadioGroup>
      </div>
    </div>
    <p class="mt-4 font-mono text-xs text-fg-muted">remember = {{ remember }} · picked = {{ picked.join(",") }} · mode = {{ mode }}</p>
  </GallerySection>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Checkbox } from "@/shared/ui/checkbox";
import { RadioGroup, Radio } from "@/shared/ui/radio";
import GallerySection from "./GallerySection.vue";
import { type Lang, useGalleryLang } from "./galleryLang";

const lang = useGalleryLang();

const checkSamples: Record<Lang, { remember: string; all: string; modes: string; ptt: string; vox: string; always: string }> = {
  en: {
    remember: "Remember my nickname on this device",
    all: "Select all channels",
    modes: "Transmit mode",
    ptt: "Push to talk",
    vox: "Voice activity",
    always: "Always on",
  },
  de: {
    remember: "Meinen Benutzernamen auf diesem Gerät für den nächsten Besuch merken",
    all: "Alle Kanäle auswählen",
    modes: "Übertragungsmodus",
    ptt: "Push-to-Talk",
    vox: "Sprachaktivierung",
    always: "Immer aktiv",
  },
  ru: {
    remember: "Запомнить мой псевдоним на этом устройстве для следующего входа",
    all: "Выбрать все каналы",
    modes: "Режим передачи",
    ptt: "Нажми и говори",
    vox: "По голосу",
    always: "Всегда включён",
  },
};
const remember = ref(true);
const picked = ref<string[]>(["lobby"]);
const mode = ref("vox");
</script>

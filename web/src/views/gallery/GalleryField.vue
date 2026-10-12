<template>
  <GallerySection id="gallery-field" title="Field · Input · Select · Textarea" note="hint · error · leading icon · disabled">
    <div class="grid gap-5 narrow:grid-cols-2">
      <Field :label="fieldSamples[lang].nick" :hint="fieldSamples[lang].nickHint">
        <Input v-model="nickname" autocomplete="off" />
      </Field>
      <Field :label="fieldSamples[lang].server" :error="fieldSamples[lang].error">
        <Input v-model="server" />
      </Field>
      <Field :label="fieldSamples[lang].nick">
        <Input model-value="Locked" disabled />
      </Field>
      <Field :label="fieldSamples[lang].region" :hint="fieldSamples[lang].nickHint">
        <Select v-model="region">
          <option v-for="(name, i) in fieldSamples[lang].regions" :key="regionKeys[i]" :value="regionKeys[i]">{{ name }}</option>
        </Select>
      </Field>
      <Field :label="fieldSamples[lang].region" :error="fieldSamples[lang].error">
        <Select model-value="eu">
          <option value="eu">{{ fieldSamples[lang].regions[1] }}</option>
        </Select>
      </Field>
      <Field :label="fieldSamples[lang].region">
        <Select model-value="eu" disabled>
          <option value="eu">{{ fieldSamples[lang].regions[1] }}</option>
        </Select>
      </Field>
      <Field :label="fieldSamples[lang].nick" :hint="fieldSamples[lang].nickHint" class="narrow:col-span-2">
        <Textarea v-model="notes" :rows="3" maxlength="500" />
      </Field>
      <div class="flex flex-col gap-1.5">
        <span class="text-ui font-medium">Without Field</span>
        <Input v-model="query" :placeholder="fieldSamples[lang].search" aria-label="Search channels">
          <template #leading><Icon name="search" /></template>
        </Input>
      </div>
    </div>
    <p class="mt-4 font-mono text-xs text-fg-muted">
      nickname = {{ nickname }} · region = {{ region }} · server = {{ server }} · query = {{ query }}
    </p>
  </GallerySection>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Field } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { Icon } from "@/shared/ui/icon";
import GallerySection from "./GallerySection.vue";
import { type Lang, useGalleryLang } from "./galleryLang";

const lang = useGalleryLang();

const fieldSamples: Record<
  Lang,
  { region: string; regions: string[]; nick: string; nickHint: string; server: string; error: string; search: string }
> = {
  en: {
    region: "Audio region",
    regions: ["Automatic (nearest)", "Europe", "North America"],
    nick: "Nickname",
    nickHint: "Shown to everyone in the channel.",
    server: "Server address",
    error: "Could not reach this server.",
    search: "Find a channel",
  },
  de: {
    region: "Bevorzugte Audioregion des Sprachservers",
    regions: ["Automatisch (nächstgelegene Region)", "Europa", "Nordamerika"],
    nick: "Benutzername",
    nickHint: "Für alle Teilnehmer im Kanal sichtbar, auch nach dem Verlassen.",
    server: "Serveradresse des Sprachservers",
    error: "Dieser Server ist derzeit nicht erreichbar.",
    search: "Kanal suchen",
  },
  ru: {
    region: "Регион обработки звука для голосового канала",
    regions: ["Автоматически (ближайший)", "Европа", "Северная Америка"],
    nick: "Псевдоним",
    nickHint: "Виден всем участникам канала.",
    server: "Адрес сервера голосовой связи",
    error: "Не удалось подключиться к этому серверу.",
    search: "Найти канал",
  },
};

const nickname = ref("Kestrel");
const region = ref("auto");
const notes = ref("");
const regionKeys = ["auto", "eu", "na"];
const server = ref("ts.example");
const query = ref("");
</script>

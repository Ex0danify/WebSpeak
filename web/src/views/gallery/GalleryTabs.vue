<template>
  <GallerySection id="gallery-tabs" title="Tabs and Segmented" note="arrow keys · Home and End · tablist or radiogroup">
    <div class="flex flex-col gap-6">
      <Tabs v-model="tabValue" class="max-w-md">
        <TabList :aria-label="tabSamples[lang].label">
          <Tab value="voice">{{ tabSamples[lang].voice }}</Tab>
          <Tab value="chat">{{ tabSamples[lang].chat }} <Count>3</Count></Tab>
          <Tab value="settings">{{ tabSamples[lang].settings }}</Tab>
          <Tab value="off" disabled>Off</Tab>
        </TabList>
        <TabPanel value="voice" class="pt-3">{{ tabSamples[lang].panel }} {{ tabSamples[lang].voice }}</TabPanel>
        <TabPanel value="chat" class="pt-3">{{ tabSamples[lang].panel }} {{ tabSamples[lang].chat }}</TabPanel>
        <TabPanel value="settings" class="pt-3">{{ tabSamples[lang].panel }} {{ tabSamples[lang].settings }}</TabPanel>
      </Tabs>
      <div class="flex flex-wrap items-center gap-6">
        <Segmented v-model="segTheme" :aria-label="tabSamples[lang].settings">
          <Segment value="system">{{ tabSamples[lang].system }}</Segment>
          <Segment value="light">{{ tabSamples[lang].light }}</Segment>
          <Segment value="dark">{{ tabSamples[lang].dark }}</Segment>
        </Segmented>
        <Tabs v-model="segView" variant="segmented">
          <TabList :aria-label="tabSamples[lang].label">
            <Tab value="members">{{ tabSamples[lang].members }}</Tab>
            <Tab value="files">{{ tabSamples[lang].files }}</Tab>
            <Tab value="log">{{ tabSamples[lang].log }}</Tab>
          </TabList> </Tabs
        ><Tabs v-model="segView" variant="pills"
          ><TabList :aria-label="tabSamples[lang].label"
            ><Tab value="members"><Icon name="users" :size="15" /> {{ tabSamples[lang].members }}</Tab
            ><Tab value="files">{{ tabSamples[lang].files }}</Tab
            ><Tab value="log">{{ tabSamples[lang].log }}</Tab></TabList
          ></Tabs
        >
      </div>
      <div class="max-w-xs">
        <Segmented v-model="segTheme" fill :aria-label="tabSamples[lang].settings">
          <Segment value="system">{{ tabSamples[lang].system }}</Segment>
          <Segment value="light">{{ tabSamples[lang].light }}</Segment>
          <Segment value="dark">{{ tabSamples[lang].dark }}</Segment>
        </Segmented>
      </div>
    </div>
    <p class="mt-4 font-mono text-xs text-fg-muted">tab = {{ tabValue }} · theme = {{ segTheme }} · view = {{ segView }}</p>
  </GallerySection>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Count } from "@/shared/ui/chip";
import { Tabs, TabList, Tab, TabPanel, Segmented, Segment } from "@/shared/ui/tabs";
import { Icon } from "@/shared/ui/icon";
import GallerySection from "@/views/gallery/GallerySection.vue";
import { type Lang, useGalleryLang } from "@/views/gallery/galleryLang";

const lang = useGalleryLang();

const tabSamples: Record<
  Lang,
  {
    label: string;
    voice: string;
    chat: string;
    settings: string;
    system: string;
    light: string;
    dark: string;
    members: string;
    files: string;
    log: string;
    panel: string;
  }
> = {
  en: {
    label: "Workspace sections",
    voice: "Voice",
    chat: "Chat",
    settings: "Settings",
    system: "System",
    light: "Light",
    dark: "Dark",
    members: "Members",
    files: "Files",
    log: "Log",
    panel: "Panel content for",
  },
  de: {
    label: "Arbeitsbereich-Abschnitte",
    voice: "Sprachkanal",
    chat: "Kanalunterhaltung",
    settings: "Einstellungen und Audiogeräte",
    system: "Systemeinstellung",
    light: "Hell",
    dark: "Dunkel",
    members: "Teilnehmer",
    files: "Dateien",
    log: "Protokoll",
    panel: "Inhalt des Bereichs",
  },
};
const tabValue = ref("voice");
const segTheme = ref("system");
const segView = ref("members");
</script>

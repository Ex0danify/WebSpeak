<template>
  <GallerySection id="gallery-card" title="Card" note="1 px line border · no shadow · optional header">
    <div class="md:grid-cols-2 grid gap-4">
      <Card>{{ cardSamples[lang].body }}</Card
      ><Card raised padding="dense" body-class="grid gap-1">{{ cardSamples[lang].body }}</Card>
      <Card as="section" :title="cardSamples[lang].title">
        {{ cardSamples[lang].body }}
        <template #actions>
          <Chip variant="success" dot>{{ cardSamples[lang].connected }}</Chip>
        </template>
      </Card>
      <Card as="section" :title="cardSamples[lang].long">
        {{ cardSamples[lang].body }}
        <template #actions>
          <Button variant="outline" size="sm">{{ cardSamples[lang].edit }}</Button>
        </template>
        <template #footer>
          <Button variant="ghost" size="sm">{{ cardSamples[lang].cancel }}</Button>
          <Button size="sm">{{ cardSamples[lang].save }}</Button>
        </template>
      </Card>
      <Card :title="cardSamples[lang].members" flush>
        <ul class="m-0 list-none divide-y divide-line p-0">
          <li class="px-5 py-2.5">Kestrel</li>
          <li class="px-5 py-2.5">Ibis</li>
          <li class="px-5 py-2.5">Wren</li>
        </ul>
      </Card>
    </div>
  </GallerySection>
</template>

<script setup lang="ts">
import { Button } from "@/shared/ui/button";
import { Chip } from "@/shared/ui/chip";
import { Card } from "@/shared/ui/card";
import GallerySection from "@/views/gallery/GallerySection.vue";
import { type Lang, useGalleryLang } from "@/views/gallery/galleryLang";

const lang = useGalleryLang();

const cardSamples: Record<
  Lang,
  {
    title: string;
    body: string;
    long: string;
    edit: string;
    save: string;
    cancel: string;
    server: string;
    members: string;
    connected: string;
  }
> = {
  en: {
    title: "Server status",
    body: "Nine members are online across four channels.",
    long: "Audio settings for this device",
    edit: "Edit",
    save: "Save",
    cancel: "Cancel",
    server: "Gateway",
    members: "Members",
    connected: "Connected · 41 ms",
  },
  de: {
    title: "Serverstatus und Verbindungsqualität",
    body: "Neun Teilnehmer sind in vier Kanälen gleichzeitig online.",
    long: "Audioeinstellungen und Geräteauswahl für dieses Gerät",
    edit: "Bearbeiten",
    save: "Speichern",
    cancel: "Abbrechen",
    server: "Gateway",
    members: "Teilnehmer",
    connected: "Verbunden · 41 ms",
  },
};
</script>

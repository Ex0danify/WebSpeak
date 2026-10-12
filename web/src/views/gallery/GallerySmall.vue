<template>
  <GallerySection id="gallery-small" title="Separator · Spinner" note="small parts">
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-center gap-4">
        <span class="text-sm">{{ smallSamples[lang].channels }}</span>
        <Separator orientation="vertical" class="h-5 self-auto" />
        <span class="text-sm">{{ smallSamples[lang].members }}</span>
        <Separator orientation="vertical" class="h-5 self-auto" :decorative="false" />
        <span class="text-sm">{{ smallSamples[lang].mute }}</span>
      </div>
      <Separator />

      <div class="flex flex-wrap items-center gap-6">
        <Spinner size="sm" />
        <Spinner />
        <Spinner size="lg" />
        <span class="inline-flex items-center gap-2 text-sm text-fg-muted"
          ><Spinner class="text-accent" />{{ smallSamples[lang].loading }}…</span
        >
        <span class="inline-flex items-center gap-2 text-sm text-accent"
          ><Spinner :label="smallSamples[lang].loadingMembers" />{{ smallSamples[lang].loadingMembers }}</span
        >
        <Button variant="secondary" loading>{{ smallSamples[lang].leave }}</Button>
      </div>
    </div>
  </GallerySection>
</template>

<script setup lang="ts">
import { Button } from "@/shared/ui/button";
import { Separator } from "@/shared/ui/separator";
import { Spinner } from "@/shared/ui/spinner";
import GallerySection from "./GallerySection.vue";
import { type Lang, useGalleryLang } from "./galleryLang";

const lang = useGalleryLang();

const smallSamples: Record<
  Lang,
  { channels: string; members: string; mute: string; leave: string; loading: string; loadingMembers: string; mic: string; toggle: string }
> = {
  en: {
    channels: "Channels",
    members: "Members",
    mute: "Mute",
    leave: "Leave channel",
    loading: "Loading",
    loadingMembers: "Loading members",
    mic: "Microphone",
    toggle: "Push to talk",
  },
  de: {
    channels: "Kanäle",
    members: "Teilnehmer",
    mute: "Stummschalten",
    leave: "Kanal verlassen",
    loading: "Wird geladen",
    loadingMembers: "Teilnehmer werden geladen",
    mic: "Mikrofon",
    toggle: "Push-to-Talk",
  },
};
</script>

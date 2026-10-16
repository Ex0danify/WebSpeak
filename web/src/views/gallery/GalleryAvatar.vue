<template>
  <GallerySection id="gallery-avatar" title="Avatar" note="initial fallback · speaking ring">
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-center gap-4">
        <span class="text-fg-muted">{{ avatarSamples[lang].title }}</span>
        <Avatar :name="avatarSamples[lang].name" size="xs" />
        <Avatar :name="avatarSamples[lang].name" size="sm" />
        <Avatar :name="avatarSamples[lang].name" size="md" />
        <Avatar :name="avatarSamples[lang].name" size="lg" />
        <Avatar :name="avatarSamples[lang].name" size="xl" />
        <Avatar name="Logo" src="/site-icon.jpg" size="lg" /><Avatar name="Broken" src="/missing.png" size="lg" /><Avatar
          :name="avatarSamples[lang].name"
          size="row"
          tint
        /><Avatar :name="avatarSamples[lang].name" size="message" tint self /><Avatar
          :name="avatarSamples[lang].long"
          size="tile"
          tint
          speaking
        /><span class="inline-flex bg-media pl-1"
          ><Avatar name="Ann" size="viewer" tint stack /><Avatar name="Bo" size="viewer" tint stack
        /></span>
      </div>
      <div class="flex flex-wrap items-center gap-6 p-2">
        <Avatar
          :name="avatarSamples[lang].name"
          size="sm"
          speaking
          :speaking-label="avatarSamples[lang].speaking"
          :label="avatarSamples[lang].name"
        />
        <Avatar :name="avatarSamples[lang].name" size="md" speaking />
        <Avatar :name="avatarSamples[lang].name" size="lg" speaking /><Avatar :name="avatarSamples[lang].name" size="xl" speaking />
        <Avatar name="Logo" src="/site-icon.jpg" size="lg" speaking />
      </div>
      <div class="flex flex-col gap-1 rounded-lg border border-line bg-surface-0 p-2">
        <div class="flex items-center gap-2 rounded-md p-2">
          <Avatar :name="avatarSamples[lang].name" surface="surface-0" speaking />
          <span class="min-w-0 truncate">{{ avatarSamples[lang].name }}</span>
        </div>
        <div class="flex items-center gap-2 rounded-md p-2">
          <Avatar :name="avatarSamples[lang].long" surface="surface-0" />
          <span class="min-w-0 truncate">{{ avatarSamples[lang].long }}</span>
        </div>
      </div>
    </div>
  </GallerySection>
</template>

<script setup lang="ts">
import { Avatar } from "@/shared/ui/avatar";
import GallerySection from "@/views/gallery/GallerySection.vue";
import { type Lang, useGalleryLang } from "@/views/gallery/galleryLang";

const lang = useGalleryLang();

const avatarSamples: Record<Lang, { name: string; long: string; speaking: string; title: string }> = {
  en: { name: "Kestrel", long: "Odin the Wanderer", speaking: "speaking", title: "Sizes" },
  de: { name: "Kestrel", long: "Odin der Wanderer aus dem Norden", speaking: "spricht gerade", title: "Größen" },
};
</script>

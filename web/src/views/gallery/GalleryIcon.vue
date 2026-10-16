<template>
  <GallerySection id="gallery-icon" title="Icon" note="md 18 px (default) · sm 15 px (dense rows)">
    <ul class="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2 p-0">
      <li v-for="name in iconNames" :key="name" class="flex items-center gap-3 rounded-md border border-line px-3 py-2">
        <Icon :name="name" />
        <Icon :name="name" size="sm" class="text-fg-muted" />
        <span class="min-w-0 truncate font-mono text-caption text-fg-muted">{{ name }}</span>
      </li>
    </ul>
  </GallerySection>
</template>

<script setup lang="ts">
import { Icon, iconNames } from "@/shared/ui/icon";
import GallerySection from "@/views/gallery/GallerySection.vue";
</script>

<script setup lang="ts">
// Gallery-only: shows the fixed (non-theme) color tokens. Tailwind needs literal class names, hence the lists.
const media = [
  { name: "media", cls: "bg-media" },
  { name: "media-raised", cls: "bg-media-raised" },
  { name: "media-deep", cls: "bg-media-deep" },
  { name: "media-fg", cls: "bg-media-fg" },
  { name: "media-fg-muted", cls: "bg-media-fg-muted" },
  { name: "media-line", cls: "bg-media-line" },
  { name: "media-scrim", cls: "bg-media-scrim" },
  { name: "media-accent", cls: "bg-media-accent" },
  { name: "media-live", cls: "bg-media-live" },
];
const title = "Fixed colors";
const caption = "same in every theme";
const rows = [
  { id: "media", label: "Media surface", swatches: media, backdrop: "bg-media" },
];
</script>

<template>
  <section aria-labelledby="gallery-tokens" class="rounded-lg border border-line bg-surface-1 p-6">
    <div class="mb-4 flex items-baseline justify-between gap-3">
      <h2 id="gallery-tokens" class="text-base font-semibold">{{ title }}</h2>
      <span class="font-mono text-caption tracking-widest text-fg-muted uppercase">{{ caption }}</span>
    </div>
    <div class="flex flex-col gap-4">
      <div v-for="row in rows" :key="row.id" class="flex flex-col gap-2">
        <span class="text-fg-muted">{{ row.label }}</span>
        <ul :class="['flex flex-wrap gap-3 rounded-lg border border-line p-3', row.backdrop]">
          <li v-for="swatch in row.swatches" :key="swatch.name" class="flex items-center gap-2">
            <span :class="['size-6 rounded-sm border border-line-strong', swatch.cls]" aria-hidden="true" />
            <code class="font-mono text-caption text-fg-muted">{{ swatch.name }}</code>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

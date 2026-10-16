<template>
  <GallerySection id="gallery-button" title="Button" note="15 variants · 8 sizes · icon · pressed tones · loading · link">
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center gap-3">
        <Button variant="primary">{{ samples[lang].short }}</Button>
        <Button variant="secondary">Cancel</Button>
        <Button variant="outline">Settings</Button>
        <Button variant="ghost">Skip</Button>
        <Button variant="danger">Leave</Button><Button variant="soft">Soft</Button><Button variant="softOutline">Soft outline</Button
        ><Button variant="accentSoft">Accent</Button><Button variant="inverse">Inverse</Button><Button variant="warning">Away</Button
        ><Button variant="tinted">Tinted</Button><Button variant="dangerSoft">Stop</Button><Button variant="pill" size="xs">Pill</Button
        ><Button variant="success">Talking</Button><Button variant="link" size="inline">Link</Button
        ><Button variant="soft" size="row" aria-current="true" class="w-32">Row</Button
        ><span class="inline-flex bg-media p-2"
          ><Button variant="media" icon-only aria-label="Close"><Icon name="close" /></Button></span
        ><Button variant="secondary" size="xs" pressed pressed-tone="accent">On</Button>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="lg">Large</Button>
        <Button disabled>Disabled</Button>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <Button><Icon name="plus" />New channel</Button>
        <Button variant="outline"><Icon name="settings" />Settings</Button>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <Button variant="outline" icon-only size="sm" aria-label="Close"><Icon name="close" /></Button>
        <Button variant="outline" icon-only aria-label="Settings"><Icon name="settings" /></Button>
        <Button variant="ghost" icon-only size="lg" aria-label="More"><Icon name="more" /></Button>
        <Button variant="secondary" icon-only :pressed="micMuted" aria-label="Mute microphone" @click="micMuted = !micMuted">
          <Icon :name="micMuted ? 'mic-off' : 'mic'" />
        </Button>
        <Button variant="secondary" icon-only :pressed="deafened" aria-label="Deafen" @click="deafened = !deafened">
          <Icon :name="deafened ? 'volume-off' : 'headset'" />
        </Button>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <Button :loading="saving" @click="saving = true">{{ saving ? "Saving" : "Click to load" }}</Button>
        <Button variant="outline" loading>Loading</Button>
        <Button variant="secondary" icon-only loading aria-label="Refreshing"><Icon name="refresh" /></Button>
        <Button v-if="saving" variant="ghost" size="sm" @click="saving = false">Reset</Button>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <Button as="a" href="#gallery-button" variant="outline">Link button</Button>
        <Button as="a" href="#gallery-button" variant="ghost" disabled>Disabled link</Button>
      </div>
      <div class="flex max-w-xs flex-wrap items-center gap-3">
        <Button>{{ samples[lang].long }}</Button>
      </div>
    </div>
  </GallerySection>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import GallerySection from "./GallerySection.vue";
import { type Lang, useGalleryLang } from "./galleryLang";

const lang = useGalleryLang();

// Sample copy for checking wrapping and clipping. Long German and Russian
// strings are the worst case, components must tolerate 40% more than English.
const samples: Record<Lang, { short: string; long: string }> = {
  en: { short: "Join channel", long: "Join the selected channel" },
  de: { short: "Kanal beitreten", long: "Dem ausgewählten Sprachkanal beitreten" },
};

const micMuted = ref(false);
const deafened = ref(true);
const saving = ref(false);
</script>

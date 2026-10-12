<script setup lang="ts">
// Dev-only component gallery, registered at /__ui when import.meta.env.DEV.
// Every shared/ui component adds its own section in gallery/ with all variants.
import { provide, ref, watch } from "vue";
import TokenSwatches from "@/shared/components/TokenSwatches.vue";
import { Select } from "@/shared/ui/select";
import { Toaster } from "@/shared/ui/toast";
import { applyTheme, getStoredTheme, saveTheme, type ThemeMode } from "@/shared/services/theme";
import GalleryAvatar from "./gallery/GalleryAvatar.vue";
import GalleryButton from "./gallery/GalleryButton.vue";
import GalleryCard from "./gallery/GalleryCard.vue";
import GalleryCheck from "./gallery/GalleryCheck.vue";
import GalleryChip from "./gallery/GalleryChip.vue";
import GalleryDialog from "./gallery/GalleryDialog.vue";
import GalleryField from "./gallery/GalleryField.vue";
import GalleryIcon from "./gallery/GalleryIcon.vue";
import GalleryMenu from "./gallery/GalleryMenu.vue";
import GalleryMeter from "./gallery/GalleryMeter.vue";
import GalleryNotice from "./gallery/GalleryNotice.vue";
import GalleryPopover from "./gallery/GalleryPopover.vue";
import GallerySlider from "./gallery/GallerySlider.vue";
import GallerySmall from "./gallery/GallerySmall.vue";
import GallerySwitch from "./gallery/GallerySwitch.vue";
import GalleryTabs from "./gallery/GalleryTabs.vue";
import GalleryTooltip from "./gallery/GalleryTooltip.vue";
import { langKey, type Lang } from "./gallery/galleryLang";

// In page order, which the gallery specs rely on.
const sections = [
  GalleryButton,
  GalleryField,
  GallerySwitch,
  GalleryCheck,
  GallerySlider,
  GalleryChip,
  GalleryTabs,
  GalleryCard,
  GalleryAvatar,
  GalleryMeter,
  GalleryDialog,
  GalleryMenu,
  GalleryPopover,
  GalleryTooltip,
  GalleryNotice,
  GallerySmall,
  GalleryIcon,
];

const themes: ThemeMode[] = ["system", "light", "dark"];
const languages: { value: Lang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "ru", label: "Русский" },
];

const toasterLabels: Record<Lang, { notifications: string; dismiss: string }> = {
  en: { notifications: "Notifications", dismiss: "Dismiss" },
  de: { notifications: "Benachrichtigungen", dismiss: "Schließen" },
  ru: { notifications: "Уведомления", dismiss: "Закрыть" },
};

const theme = ref<ThemeMode>(getStoredTheme());
const lang = ref<Lang>("en");
provide(langKey, lang);

watch(theme, (value) => {
  saveTheme(value);
  applyTheme(value);
});
</script>

<template>
  <div class="min-h-screen bg-surface-0 font-sans text-sm text-fg" :lang="lang">
    <header class="sticky top-0 z-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-surface-1 px-6 py-3">
      <h1 class="text-lg font-semibold">UI gallery</h1>
      <span class="font-mono text-caption tracking-widest text-fg-muted uppercase">dev only</span>
      <div class="ml-auto flex flex-wrap items-center gap-4">
        <label class="flex items-center gap-2">
          <span class="text-fg-muted">Theme</span>
          <Select v-model="theme" class="w-32">
            <option v-for="value in themes" :key="value" :value="value">{{ value }}</option>
          </Select>
        </label>
        <label class="flex items-center gap-2">
          <span class="text-fg-muted">Language</span>
          <Select v-model="lang" class="w-40">
            <option v-for="option in languages" :key="option.value" :value="option.value">{{ option.label }}</option>
          </Select>
        </label>
      </div>
    </header>

    <main class="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
      <component :is="section" v-for="(section, index) in sections" :key="index" />
      <TokenSwatches />
    </main>
    <Toaster :label="toasterLabels[lang].notifications" :dismiss-label="toasterLabels[lang].dismiss" />
  </div>
</template>

<template>
  <section class="mx-3.5 mt-4 hidden gap-2.5 overflow-y-auto rounded-lg border border-line bg-surface-1 p-4.5 shadow-sm max-compact:grid" role="main">
    <h1 class="sr-only">{{ t('voiceSpace') }}</h1>
    <span class="text-ui font-bold tracking-kicker text-fg-muted">{{ t('mobileMore') }}</span>
    <h2 class="mb-2 text-2xl font-bold text-fg">{{ t('mobileMore') }}</h2>
    <Button :variant="microphoneMuted ? 'dangerSoft' : 'outline'" :class="moreActionClass" @click="$emit('toggle-microphone')"><Icon :name="microphoneMuted ? 'mic-off' : 'mic'" :size="18" /> {{ microphoneMuted ? t('unmuteMic') : t('muteMic') }}</Button>
    <Button variant="outline" :class="moreActionClass" @click="$emit('open-settings')"><Icon name="settings" :size="18" /> {{ t('audioSettings') }}</Button>
    <Button variant="outline" :class="moreActionClass" @click="$emit('cycle-theme')"><Icon :name="themeIcon" :size="18" /> {{ themeLabel }}</Button>
    <div class="flex items-center gap-2.5"><Icon name="globe" :size="18" /><span class="flex-1">{{ t('languageMenu') }}</span><LanguageSwitcher v-model="language" :menu-label="t('languageMenu')" :close-label="t('close')" @change="$emit('language-change')" /></div>
    <Button variant="dangerSoft" :class="moreActionClass" @click="$emit('disconnect')"><Icon name="door" :size="18" /> {{ t('exit') }}</Button>
  </section>
</template>

<script setup lang="ts">
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import LanguageSwitcher from "@/shared/components/LanguageSwitcher.vue";
import { useI18n } from "@/shared/i18n/useI18n.js";

defineProps<{
  microphoneMuted: boolean;
  themeIcon: "sun" | "moon";
  themeLabel: string;
}>();

defineEmits<{
  (e: "toggle-microphone"): void;
  (e: "open-settings"): void;
  (e: "cycle-theme"): void;
  (e: "language-change"): void;
  (e: "disconnect"): void;
}>();

const { language, t } = useI18n();

// Rows of the mobile More panel: full-width outline buttons with a left-aligned icon and label.
const moreActionClass = "h-auto font-normal min-h-13 justify-start gap-2.5 whitespace-normal rounded-md border-line bg-surface-2 px-3 text-left text-sm hover:border-accent hover:bg-surface-2 hover:text-accent";
</script>

<template>
  <section class="mobile-more-panel" role="main">
    <h1 class="sr-only">{{ t('voiceSpace') }}</h1>
    <span class="section-kicker">{{ t('mobileMore') }}</span>
    <h2>{{ t('mobileMore') }}</h2>
    <Button variant="outline" :class="microphoneMuted ? `${moreActionClass} text-danger` : moreActionClass" @click="$emit('toggle-microphone')"><Icon :name="microphoneMuted ? 'mic-off' : 'mic'" :size="18" /> {{ microphoneMuted ? t('unmuteMic') : t('muteMic') }}</Button>
    <Button variant="outline" :class="moreActionClass" @click="$emit('open-settings')"><Icon name="settings" :size="18" /> {{ t('audioSettings') }}</Button>
    <Button variant="outline" :class="moreActionClass" @click="$emit('cycle-theme')"><Icon :name="themeIcon" :size="18" /> {{ themeLabel }}</Button>
    <div class="language-menu-row"><Icon name="globe" :size="18" /><span>{{ t('languageMenu') }}</span><LanguageSwitcher v-model="language" :menu-label="t('languageMenu')" :close-label="t('close')" @change="$emit('language-change')" /></div>
    <Button variant="outline" :class="`${moreActionClass} text-danger`" @click="$emit('disconnect')"><Icon name="door" :size="18" /> {{ t('exit') }}</Button>
  </section>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import LanguageSwitcher from "@/components/LanguageSwitcher.vue";
import { useI18n } from "@/i18n/use-i18n.js";

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
const moreActionClass = "h-auto font-normal min-h-[52px] justify-start gap-2.5 whitespace-normal rounded-[9px] border-line bg-surface-2 px-3 text-left text-sm hover:border-accent hover:bg-surface-2 hover:text-accent";
</script>

<style scoped>
/* .section-kicker is shared with the voice and member headings, still styled
   in WebClient.vue / MemberPanel.vue, so its rules are duplicated here. */
.section-kicker { color: var(--ws-fg-muted); font-size: 10px; font-weight: 700; letter-spacing: .16em; }
.app-shell .section-kicker { font-size: 12.5px; }
.language-menu-row { display: flex; align-items: center; gap: 10px; }
.language-menu-row > span { flex: 1; }
.mobile-more-panel { display: none; }

@media (max-width: 740px) {
  .mobile-more-panel { display: grid; gap: 10px; width: min(100% - 30px, 650px); margin: 26px auto 0; padding: 20px; border: 1px solid var(--ws-line); border-radius: 14px; background: var(--ws-surface-1); box-shadow: 0 7px 18px color-mix(in srgb, var(--ws-fg) 8%, transparent); }
  .mobile-more-panel h2 { margin: 0 0 8px; color: var(--ws-fg); font-size: 24px; font-weight: 700; }
  .mobile-more-panel { min-height: 0; max-height: none; margin-bottom: 0; overflow-y: auto; }
  .mobile-more-panel { width: calc(100% - 28px); max-height: none; margin: 16px auto 0; padding: 18px; border-radius: 18px; overflow-y: auto; }
  .mobile-more-panel h2 { font-size: 25px; }
}
</style>

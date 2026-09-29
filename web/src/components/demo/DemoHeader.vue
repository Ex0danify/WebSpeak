<template>
  <header class="demo-header">
    <div class="demo-brand"><span><Icon name="waveform" :size="21" /></span><div><strong>WebSpeak</strong><small>{{ t('demoBrowserClient') }}</small></div></div>
    <div class="demo-tools"><span class="demo-badge">{{ t('demoBadge') }}</span><LanguageSwitcher v-model="language" :menu-label="t('languageMenu')" @change="persistLanguage" /><Button as="a" href="/" variant="outline" size="sm" class="demo-back-full">{{ t('demoBack') }}</Button><Button as="a" href="/" variant="outline" size="sm" icon-only :aria-label="t('demoBack')" class="demo-back-compact"><Icon name="home" :size="16" /></Button></div>
  </header>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import LanguageSwitcher from "../LanguageSwitcher.vue";
import { useI18n } from "@/i18n/use-i18n";

const { language, t, setLanguage } = useI18n();

function persistLanguage() { setLanguage(language.value); }
</script>

<style scoped>
.demo-header { display: flex; align-items: center; justify-content: space-between; width: min(1380px, 100%); min-height: 82px; margin: 0 auto; }
.demo-brand, .demo-tools, .demo-brand > div, .demo-tools { display: flex; align-items: center; }
.demo-brand { gap: 10px; }
.demo-brand > span { display: grid; place-items: center; width: 39px; height: 39px; color: var(--ws-accent-fg); background: var(--ws-accent); border-radius: 12px; }
.demo-brand strong, .demo-brand small { display: block; }
.demo-brand strong { color: var(--ws-accent); font-size: 18px; }
.demo-brand small { margin-top: 2px; color: var(--ws-fg-muted); font-size: 10px; }
.demo-tools { gap: 15px; color: var(--ws-fg-muted); font-size: 12px; }
.demo-badge { color: var(--ws-success); font-weight: 700; }
.demo-back-compact { display: none; }
@media (max-width: 720px) {
  .demo-header { min-height: 68px; }
  .demo-tools { gap: 6px; font-size: 10px; }
  .demo-badge { display: none; }
}
@media (max-width: 420px) {
  .demo-back-full { display: none; }
  .demo-back-compact { display: inline-flex; }
}
</style>

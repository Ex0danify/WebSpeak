<template>
  <header class="mx-auto flex min-h-20.5 w-full max-w-345 items-center justify-between max-demo:min-h-17">
    <div class="flex items-center gap-2.5"><span class="grid size-9.75 place-items-center rounded-lg bg-accent text-accent-fg"><Icon name="waveform" :size="21" /></span><div class="flex items-center"><div><strong class="block text-lg text-accent">{{ APP_NAME }}</strong><small class="mt-0.5 block text-2xs text-fg-muted">{{ t('demoBrowserClient') }}</small></div></div></div>
    <div class="flex items-center gap-3.75 text-xs text-fg-muted max-demo:gap-1.5 max-demo:text-2xs"><span class="font-bold text-success max-demo:hidden">{{ t('demoBadge') }}</span><LanguageSwitcher v-model="language" :menu-label="t('languageMenu')" @change="persistLanguage" /><Button as="a" href="/" variant="outline" size="sm" class="max-phone-lg:hidden">{{ t('demoBack') }}</Button><Tooltip :text="t('demoBack')"><Button as="a" href="/" variant="outline" size="sm" icon-only :aria-label="t('demoBack')" class="hidden max-phone-lg:inline-flex"><Icon name="home" :size="16" /></Button></Tooltip></div>
  </header>
</template>

<script setup lang="ts">
import { APP_NAME } from "@/shared/lib/brand";
import { Button } from "@/shared/ui/button";
import { Tooltip } from "@/shared/ui/tooltip";
import { Icon } from "@/shared/ui/icon";
import LanguageSwitcher from "@/shared/components/LanguageSwitcher.vue";
import { useI18n } from "@/shared/i18n/useI18n";

const { language, t, setLanguage } = useI18n();

function persistLanguage() { setLanguage(language.value); }
</script>

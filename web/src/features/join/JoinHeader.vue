<template>
  <header role="banner">
    <div class="flex items-center gap-3 max-phone-lg:min-w-0 max-phone-lg:flex-auto max-phone-lg:gap-1.75 max-phone-xs:w-8 max-phone-xs:flex-none">
      <img class="block size-10 rounded-lg bg-accent object-cover shadow-sm max-phone-lg:size-8 max-phone-lg:rounded-md" src="/site-icon.jpg" :alt="APP_NAME" />
      <div class="max-phone-xs:hidden">
        <strong class="block text-xl tracking-brand text-accent max-phone-lg:truncate max-phone-lg:text-ui">{{ siteName }}</strong>
        <small class="mt-0.5 block text-caption uppercase tracking-label text-fg-muted max-phone-lg:hidden">{{ t('browserWorkspace') }}</small>
      </div>
    </div>
    <div class="flex items-center gap-4.25 max-compact:gap-1.75 max-phone-lg:min-w-0 max-phone-lg:flex-none max-phone-lg:gap-0.5"><div class="flex items-center gap-2 text-caption text-fg-muted max-compact:hidden"><span class="inline-block size-1.75 rounded-full bg-success ring-4 ring-success/14"></span> {{ t('secureGateway') }}</div><Button as="a" variant="inverse" size="sm" :class="joinActionClass" href="https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak" target="_blank" rel="noreferrer" :title="t('githubRepository')" :aria-label="t('githubRepository')"><Icon name="github" /><span class="max-compact:hidden">{{ t('githubRepository') }}</span></Button><Button variant="tinted" size="sm" :class="joinActionClass" :title="t('qqGroup')" :aria-label="t('qqGroup')" aria-haspopup="dialog" @click="$emit('qq-open')"><Icon name="qq" /><span class="max-compact:hidden">{{ t('qqGroup') }}</span></Button><Button as="a" variant="dangerSoft" size="sm" :class="joinActionClass" href="https://space.bilibili.com/25414873" target="_blank" rel="noreferrer" :title="t('bilibiliProfile')" :aria-label="t('bilibiliProfile')"><span class="grid size-[18px] place-items-center rounded-sm bg-danger text-caption leading-none text-accent-fg">{{ BRAND_GLYPH }}</span><span class="max-compact:hidden">{{ t('bilibiliProfile') }}</span></Button><Chip variant="accent" class="h-[30px] max-phone-lg:min-w-7 max-phone-lg:justify-center" :title="`${t('currentVersion')}: v${appVersion}`" :aria-label="`${t('currentVersion')}: v${appVersion}`">{{ VERSION_PREFIX }}{{ appVersion }}</Chip><Button as="a" variant="tinted" size="sm" :class="joinActionClass" href="https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak/blob/master/CHANGELOG.md" target="_blank" rel="noreferrer" :title="t('viewChangelog')" :aria-label="t('viewChangelog')"><Icon name="clock" size="sm" /><span class="max-compact:hidden">{{ t('viewChangelog') }}</span></Button><Button as="a" variant="tinted" size="sm" :class="joinActionClass" href="/admin" :title="t('adminConsole')" :aria-label="t('adminConsole')"><Icon name="settings" size="sm" /><span class="max-compact:hidden">{{ t('adminConsole') }}</span></Button><Tooltip :text="themeLabel"><Button variant="ghost" size="sm" icon-only class="max-phone-lg:hidden" :aria-label="themeLabel" @click="$emit('cycle-theme')"><Icon :name="themeIcon" /></Button></Tooltip><LanguageSwitcher v-model="language" :menu-label="t('languageMenu')" :close-label="t('close')" @change="$emit('language-change')" /></div>
  </header>
</template>

<script setup lang="ts">
import { APP_NAME, BRAND_GLYPH, VERSION_PREFIX } from "@/shared/lib/brand";
import { Button } from "@/shared/ui/button";
import { Tooltip } from "@/shared/ui/tooltip";
import { Chip } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import LanguageSwitcher from "@/shared/components/LanguageSwitcher.vue";
import { useI18n } from "@/shared/i18n/useI18n.js";

defineProps<{
  siteName: string;
  appVersion: string;
  themeIcon: "sun" | "moon";
  themeLabel: string;
}>();

defineEmits<{
  (e: "qq-open"): void;
  (e: "cycle-theme"): void;
  (e: "language-change"): void;
}>();

const { language, t } = useI18n();

// Labels wrap (de and ru are long) and hide on narrow screens, where the buttons shrink to squares.
const joinActionClass = "h-auto min-h-8 whitespace-normal py-1 text-left text-caption leading-[1.15] max-compact:w-8 max-compact:px-0 max-compact:py-0 max-phone-lg:size-7 max-phone-lg:min-h-7";
</script>

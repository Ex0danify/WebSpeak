<template>
  <header class="join-header" role="banner">
    <div class="brand-lockup">
      <img class="brand-mark" src="/网站图标.jpg" alt="WebSpeak" />
      <div>
        <strong>{{ siteName }}</strong>
        <small>{{ t('browserWorkspace') }}</small>
      </div>
    </div>
    <div class="header-tools"><div class="header-note"><span class="tiny-dot"></span> {{ t('secureGateway') }}</div><Button as="a" size="sm" class="bg-fg text-surface-1 hover:bg-accent hover:text-accent-fg" :class="joinActionClass" href="https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak" target="_blank" rel="noreferrer" :title="t('githubRepository')" :aria-label="t('githubRepository')"><Icon name="github" /><span class="max-[740px]:hidden">{{ t('githubRepository') }}</span></Button><Button variant="outline" size="sm" class="text-accent" :class="joinActionClass" :title="t('qqGroup')" :aria-label="t('qqGroup')" aria-haspopup="dialog" @click="$emit('qq-open')"><Icon name="qq" /><span class="max-[740px]:hidden">{{ t('qqGroup') }}</span></Button><Button as="a" variant="outline" size="sm" class="border-danger/30 bg-danger-soft text-danger hover:bg-danger-soft" :class="joinActionClass" href="https://space.bilibili.com/25414873" target="_blank" rel="noreferrer" :title="t('bilibiliProfile')" :aria-label="t('bilibiliProfile')"><span class="grid size-[18px] place-items-center rounded-[5px] bg-danger text-[11px] leading-none text-accent-fg">B</span><span class="max-[740px]:hidden">{{ t('bilibiliProfile') }}</span></Button><Chip variant="accent" class="h-[30px] max-[420px]:min-w-7 max-[420px]:justify-center max-[420px]:px-1 max-[420px]:text-[9px]" :title="`${t('currentVersion')}: v${appVersion}`" :aria-label="`${t('currentVersion')}: v${appVersion}`">v{{ appVersion }}</Chip><Button as="a" variant="outline" size="sm" class="text-accent" :class="joinActionClass" href="https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak/blob/master/CHANGELOG.md" target="_blank" rel="noreferrer" :title="t('viewChangelog')" :aria-label="t('viewChangelog')"><Icon name="clock" size="sm" /><span class="max-[740px]:hidden">{{ t('viewChangelog') }}</span></Button><Button as="a" variant="outline" size="sm" class="text-accent" :class="joinActionClass" href="/admin" :title="t('adminConsole')" :aria-label="t('adminConsole')"><Icon name="settings" size="sm" /><span class="max-[740px]:hidden">{{ t('adminConsole') }}</span></Button><Button variant="ghost" size="sm" icon-only class="max-[420px]:hidden" :title="themeLabel" :aria-label="themeLabel" @click="$emit('cycle-theme')"><Icon :name="themeIcon" /></Button><LanguageSwitcher v-model="language" class="join-language-switcher" :menu-label="t('languageMenu')" :close-label="t('close')" @change="$emit('language-change')" /></div>
  </header>
</template>

<script setup lang="ts">
import { Button } from "@/shared/ui/button";
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
const joinActionClass = "h-auto min-h-8 whitespace-normal py-1 text-left text-[11px] leading-[1.15] max-[740px]:w-8 max-[740px]:px-0 max-[740px]:py-0 max-[420px]:size-7 max-[420px]:min-h-7";
</script>

<style scoped>
.brand-lockup { display: flex; align-items: center; gap: 12px; }
.brand-mark { display: grid; place-items: center; color: var(--ws-accent-fg); background: var(--ws-accent); box-shadow: 0 8px 18px color-mix(in srgb, var(--ws-accent) 15%, transparent); }
.brand-mark { display: block; width: 40px; height: 40px; border-radius: 12px; object-fit: cover; }
.brand-lockup strong { display: block; color: var(--ws-accent); font-size: 18px; letter-spacing: -.04em; }
.brand-lockup strong span { color: var(--ws-fg); font-weight: 500; }
.brand-lockup small { display: block; margin-top: 2px; color: var(--ws-fg-muted); font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
.header-tools { display: flex; align-items: center; gap: 17px; }
.header-note { display: flex; align-items: center; gap: 8px; color: var(--ws-fg-muted); font-size: 12px; }
.tiny-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--ws-success); box-shadow: 0 0 0 4px color-mix(in srgb, var(--ws-success) 14%, transparent); }

.header-tools { align-items: center; }

@media (max-width: 740px) {
  .header-tools { gap: 7px; }
  .header-note { display: none; }
}

.join-page .brand-lockup strong { font-size: 22.5px; }
.join-page .brand-lockup small, .join-page .header-note { font-size: 12.5px; }

.header-note { color: var(--ws-fg-muted); }

@media (max-width: 390px) {
  .join-page .header-tools { gap: 4px; }
}

@media (max-width: 420px) {
  .join-page .brand-lockup { min-width: 0; flex: 1 1 auto; gap: 7px; }
  .join-page .brand-mark { width: 32px; height: 32px; border-radius: 9px; }
  .join-page .brand-lockup strong { overflow: hidden; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
  .join-page .brand-lockup small { display: none; }
  .join-page .header-tools { min-width: 0; flex: 0 0 auto; gap: 2px; }
}

@media (max-width: 360px) {
  .join-page .brand-lockup > div { display: none; }
  .join-page .brand-lockup { flex: 0 0 32px; }
}

:root[lang="en"] .brand-lockup strong,
:root[lang="de"] .brand-lockup strong { font-size: 19.8px; }
:root[lang="en"] .brand-lockup small,
:root[lang="en"] .header-note,
:root[lang="de"] .brand-lockup small,
:root[lang="de"] .header-note { font-size: 11px; }

@media (max-width: 420px) {
  :root[lang="en"] .brand-lockup strong,
  :root[lang="de"] .brand-lockup strong { font-size: 13.2px; }
}
</style>

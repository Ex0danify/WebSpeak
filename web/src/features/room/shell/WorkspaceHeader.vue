<template>
  <header class="workspace-header">
    <div class="breadcrumbs"><span class="mobile-brand">TeamSpeak <em>Web</em></span><span class="crumb-muted">{{ t('serverBreadcrumb') }}</span><Icon name="chevron-right" :size="14" /><strong>{{ currentChannelName }}</strong></div>
    <div class="workspace-actions">
      <slot name="network-performance" />
      <Button variant="ghost" size="sm" icon-only :class="headerActionClass" :title="t('copyInvite')" :aria-label="t('copyInvite')" @click="$emit('share')"><Icon name="share" /></Button>
      <Button v-if="isMobileViewport" variant="ghost" size="sm" icon-only :class="headerActionClass" :pressed="microphoneMuted" :title="microphoneMuted ? t('unmuteMic') : t('muteMic')" :aria-label="microphoneMuted ? t('microphoneMuted') : t('microphoneActive')" @click="$emit('toggle-microphone')"><Icon :name="microphoneMuted ? 'mic-off' : 'mic'" /></Button>
      <Button v-if="isMobileViewport" variant="ghost" size="sm" icon-only :class="headerActionClass" :title="t('audioSettings')" :aria-label="t('audioSettings')" @click="$emit('open-settings')"><Icon name="settings" /></Button>
      <Button variant="ghost" size="sm" icon-only :class="`${headerActionClass} max-[740px]:hidden`" :title="themeLabel" :aria-label="themeLabel" @click="$emit('cycle-theme')"><Icon :name="themeIcon" /></Button>
      <LanguageSwitcher v-model="language" class="workspace-language" :menu-label="t('languageMenu')" :close-label="t('close')" @change="$emit('language-change')" />
      <Button variant="ghost" size="sm" class="ml-2 gap-1.5 border-transparent bg-danger-soft text-sm font-bold text-danger hover:bg-danger hover:text-accent-fg max-[740px]:ml-0 max-[740px]:size-9 max-[740px]:px-0 max-[391px]:size-8" :title="t('exit')" :aria-label="t('exit')" @click="$emit('disconnect')"><Icon name="door" :size="17" /><span class="max-[740px]:hidden">{{ t('exit') }}</span></Button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import LanguageSwitcher from "@/shared/components/LanguageSwitcher.vue";
import { useI18n } from "@/shared/i18n/useI18n.js";

defineProps<{
  currentChannelName: string;
  isMobileViewport: boolean;
  microphoneMuted: boolean;
  themeIcon: "sun" | "moon";
  themeLabel: string;
}>();

defineEmits<{
  (e: "share"): void;
  (e: "toggle-microphone"): void;
  (e: "open-settings"): void;
  (e: "cycle-theme"): void;
  (e: "language-change"): void;
  (e: "disconnect"): void;
}>();

const { language, t } = useI18n();

const headerActionClass = "shrink-0 text-fg-muted hover:text-accent max-[740px]:size-9 max-[391px]:size-8";
</script>

<style scoped>
.workspace-header { display: flex; align-items: center; justify-content: space-between; min-height: 73px; padding: 0 29px; border-bottom: 1px solid var(--ws-line); }
.breadcrumbs { display: flex; align-items: center; gap: 9px; min-width: 0; color: var(--ws-fg-muted); font-size: 12px; }
.breadcrumbs strong { overflow: hidden; color: var(--ws-fg); text-overflow: ellipsis; white-space: nowrap; }
.crumb-muted { color: var(--ws-fg-muted); }
.mobile-brand { display: none; color: var(--ws-accent); font-size: 17px; font-weight: 800; letter-spacing: -.06em; }
.mobile-brand em { color: var(--ws-fg); font-style: normal; font-weight: 500; }
.workspace-actions { display: flex; align-items: center; gap: 8px; }
.workspace-language { margin-left: 3px; }

@media (max-width: 740px) {
  .workspace-header { min-height: 61px; padding: 0 15px; }
  .mobile-brand { display: inline; }
  .crumb-muted, .breadcrumbs > .ui-icon, .breadcrumbs > strong { display: none; }
  .workspace-actions { gap: 3px; }
}

/* Increase connected-view typography by 25%, matching the .app-shell scale in RoomWorkspace. */
.app-shell .breadcrumbs { font-size: 15px; }

.workspace-actions { align-items: center; flex-wrap: nowrap; }

.workspace-header { background: var(--ws-surface-1); border-color: var(--ws-line); }
.workspace-header { border-bottom-color: var(--ws-line); }

@media (max-width: 740px) {
  .workspace-header { min-height: calc(60px + env(safe-area-inset-top, 0px)); padding: env(safe-area-inset-top, 0px) 14px 0; box-sizing: border-box; position: sticky; top: 0; z-index: 6; background: color-mix(in srgb, var(--ws-surface-1) 94%, transparent); backdrop-filter: blur(14px); }
  .breadcrumbs { flex: 1 1 auto; min-width: 0; gap: 6px; font-size: 13px; }
  .breadcrumbs .crumb-muted, .breadcrumbs > .ui-icon { display: none; }
  .mobile-brand { display: inline; font-size: 18px; }
  .workspace-actions { flex: 0 0 auto; gap: 3px; }
  .workspace-actions .workspace-language { display: none; }
}

@media (max-width: 390px) {
  .workspace-header { padding-inline: 10px; }
}
</style>

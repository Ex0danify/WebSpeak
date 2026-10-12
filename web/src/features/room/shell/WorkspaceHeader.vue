<template>
  <header
    class="flex min-h-18.25 items-center justify-between border-b border-line bg-surface-1 px-7.25 max-compact:sticky max-compact:top-0 max-compact:z-6 max-compact:min-h-[calc(60px+env(safe-area-inset-top,0px))] max-compact:bg-surface-1/94 max-compact:px-3.5 max-compact:pt-[env(safe-area-inset-top,0px)] max-compact:backdrop-blur-md max-phone:px-2.5"
  >
    <div class="flex min-w-0 items-center gap-2.25 text-md text-fg-muted max-compact:flex-auto max-compact:gap-1.5 max-compact:text-ui">
      <span class="hidden text-lg font-extrabold tracking-brand text-accent max-compact:inline"
        >{{ TEAMSPEAK_NAME }} <em class="font-medium text-fg not-italic">{{ WEB_LABEL }}</em></span
      ><span class="max-compact:hidden">{{ t("serverBreadcrumb") }}</span
      ><Icon name="chevron-right" :size="14" class="max-compact:hidden" /><strong class="truncate text-fg max-compact:hidden">{{
        currentChannelName
      }}</strong>
    </div>
    <div class="flex flex-nowrap items-center gap-2 max-compact:flex-none max-compact:gap-0.75">
      <slot name="network-performance" />
      <Tooltip :text="t('copyInvite')"
        ><Button variant="ghost" size="sm" icon-only :class="headerActionClass" :aria-label="t('copyInvite')" @click="$emit('share')"
          ><Icon name="share" /></Button
      ></Tooltip>
      <Tooltip :text="microphoneMuted ? t('microphoneMuted') : t('microphoneActive')"
        ><Button
          v-if="isMobileViewport"
          variant="ghost"
          size="sm"
          icon-only
          :class="headerActionClass"
          :pressed="microphoneMuted"
          :aria-label="microphoneMuted ? t('microphoneMuted') : t('microphoneActive')"
          @click="$emit('toggle-microphone')"
          ><Icon :name="microphoneMuted ? 'mic-off' : 'mic'" /></Button
      ></Tooltip>
      <Tooltip :text="t('audioSettings')"
        ><Button
          v-if="isMobileViewport"
          variant="ghost"
          size="sm"
          icon-only
          :class="headerActionClass"
          :aria-label="t('audioSettings')"
          @click="$emit('open-settings')"
          ><Icon name="settings" /></Button
      ></Tooltip>
      <Tooltip :text="themeLabel"
        ><Button
          variant="ghost"
          size="sm"
          icon-only
          :class="`${headerActionClass} max-compact:hidden`"
          :aria-label="themeLabel"
          @click="$emit('cycle-theme')"
          ><Icon :name="themeIcon" /></Button
      ></Tooltip>
      <LanguageSwitcher
        v-model="language"
        class="ml-0.75 max-compact:hidden"
        :menu-label="t('languageMenu')"
        :close-label="t('close')"
        @change="$emit('language-change')"
      />
      <Button
        variant="dangerSoft"
        size="sm"
        square-on-phone
        class="ml-2 gap-1.5 max-compact:ml-0"
        :title="t('exit')"
        :aria-label="t('exit')"
        @click="$emit('disconnect')"
        ><Icon name="door" :size="17" /><span class="max-compact:hidden">{{ t("exit") }}</span></Button
      >
    </div>
  </header>
</template>

<script setup lang="ts">
import { TEAMSPEAK_NAME, WEB_LABEL } from "@/shared/lib/brand";
import { Button } from "@/shared/ui/button";
import { Tooltip } from "@/shared/ui/tooltip";
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

const headerActionClass = "shrink-0 text-fg-muted hover:text-accent max-compact:size-9 max-phone:size-8";
</script>

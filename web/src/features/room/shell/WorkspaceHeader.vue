<template>
  <header
    class="flex min-h-18.25 items-center justify-between border-b border-line bg-surface-1 px-7.25 max-compact:sticky max-compact:top-0 max-compact:z-6 max-compact:min-h-[calc(60px+env(safe-area-inset-top,0px))] max-compact:bg-surface-1/94 max-compact:px-3.5 max-compact:pt-[env(safe-area-inset-top,0px)] max-compact:backdrop-blur-md max-phone:px-2.5"
  >
    <div class="flex min-w-0 items-center gap-2.25 text-md text-fg-muted max-compact:flex-auto max-compact:gap-1.5 max-compact:text-ui">
      <span class="hidden text-lg font-extrabold tracking-brand text-accent max-compact:inline"
        >{{ TEAMSPEAK_NAME }} <em class="font-medium text-fg not-italic">{{ WEB_LABEL }}</em></span
      ><strong class="truncate text-fg max-compact:hidden">{{ serverName || t("serverBreadcrumb") }}</strong
      ><span class="flex-none text-ui max-compact:hidden"
        ><span aria-hidden="true">· </span>{{ t("onlineShort", { count: onlineCount }) }}</span
      >
    </div>
    <div class="flex flex-nowrap items-center gap-2 max-compact:flex-none max-compact:gap-0.75">
      <slot name="event-log" />
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
      <DisplaySettingsPopover
        v-if="!isMobileViewport"
        :theme-mode="themeMode"
        :button-class="headerActionClass"
        @select-theme="(mode) => $emit('select-theme', mode)"
        @language-change="$emit('language-change')"
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
import DisplaySettingsPopover from "@/features/room/shell/DisplaySettingsPopover.vue";
import { useI18n } from "@/shared/i18n/useI18n.js";
import type { ThemeMode } from "@/shared/services/theme.js";

defineProps<{
  serverName: string;
  onlineCount: number;
  isMobileViewport: boolean;
  microphoneMuted: boolean;
  themeMode: ThemeMode;
}>();

defineEmits<{
  (e: "share"): void;
  (e: "toggle-microphone"): void;
  (e: "open-settings"): void;
  (e: "select-theme", mode: ThemeMode): void;
  (e: "language-change"): void;
  (e: "disconnect"): void;
}>();

const { t } = useI18n();

const headerActionClass = "shrink-0 text-fg-muted hover:text-accent max-compact:size-9 max-phone:size-8";
</script>

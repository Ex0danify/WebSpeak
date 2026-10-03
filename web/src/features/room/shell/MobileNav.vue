<template>
  <nav class="mobile-nav" :aria-label="t('mobileNavigation')">
    <Tabs v-model="mobileSection" variant="segmented" class="flex flex-1">
      <TabList fill :aria-label="t('mobileNavigation')" class="grid flex-1 grid-cols-4 gap-0.5 rounded-none bg-transparent p-0">
        <Tab value="channels" class="h-auto min-h-[52px] max-[740px]:h-auto flex-col justify-start pt-[5.5px] gap-[12px] rounded-lg px-1 text-xs font-normal aria-selected:bg-accent-soft aria-selected:font-bold aria-selected:text-accent aria-selected:shadow-none"><Icon name="volume" :size="18" /><span class="max-w-full truncate">{{ t('mobileChannels') }}</span></Tab>
        <Tab value="chat" class="h-auto min-h-[52px] max-[740px]:h-auto flex-col justify-start pt-[5.5px] gap-[12px] rounded-lg px-1 text-xs font-normal aria-selected:bg-accent-soft aria-selected:font-bold aria-selected:text-accent aria-selected:shadow-none"><Icon name="message" :size="18" /><span class="max-w-full truncate">{{ t('mobileChat') }}</span></Tab>
        <Tab value="voice" class="h-auto min-h-[52px] max-[740px]:h-auto flex-col justify-start pt-[5.5px] gap-[12px] rounded-lg px-1 text-xs font-normal aria-selected:bg-accent-soft aria-selected:font-bold aria-selected:text-accent aria-selected:shadow-none"><Icon name="mic" :size="18" /><span class="max-w-full truncate">{{ t('mobileVoice') }}</span></Tab>
        <Tab value="more" class="h-auto min-h-[52px] max-[740px]:h-auto flex-col justify-start pt-[5.5px] gap-[12px] rounded-lg px-1 text-xs font-normal aria-selected:bg-accent-soft aria-selected:font-bold aria-selected:text-accent aria-selected:shadow-none"><Icon name="more" :size="18" /><span class="max-w-full truncate">{{ t('mobileMore') }}</span></Tab>
      </TabList>
    </Tabs>
  </nav>
</template>

<script setup lang="ts">
import { Icon } from "@/shared/ui/icon";
import { Tab, TabList, Tabs } from "@/shared/ui/tabs";
import { useI18n } from "@/shared/i18n/useI18n.js";

const mobileSection = defineModel<"channels" | "chat" | "voice" | "more">({ required: true });

const { t } = useI18n();
</script>

<style scoped>
.mobile-nav { display: none; }

@media (max-width: 740px) {
  .mobile-nav { position: fixed; z-index: 30; right: 0; bottom: 0; left: 0; display: flex; min-height: 68px; padding: 6px 8px calc(6px + env(safe-area-inset-bottom, 0px)); background: color-mix(in srgb, var(--ws-surface-1) 94%, transparent); border-top: 1px solid var(--ws-line); box-shadow: 0 -7px 20px color-mix(in srgb, var(--ws-fg) 8%, transparent); backdrop-filter: blur(14px); }
  .mobile-nav { min-height: 74px; padding: 8px 8px calc(8px + env(safe-area-inset-bottom, 0px)); }
}
</style>

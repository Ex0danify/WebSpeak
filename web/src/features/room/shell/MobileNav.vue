<template>
  <nav class="fixed inset-x-0 bottom-0 z-30 hidden min-h-18.5 border-t border-line bg-surface-1/94 px-2 pt-2 pb-[calc(8px+env(safe-area-inset-bottom,0px))] shadow-sm backdrop-blur-md max-compact:flex" :aria-label="t('mobileNavigation')">
    <Tabs v-model="mobileSection" variant="bar" class="flex flex-1">
      <TabList fill :aria-label="t('mobileNavigation')">
        <Tab value="channels"><Icon name="volume" :size="18" /><span class="max-w-full truncate">{{ t('mobileChannels') }}</span></Tab>
        <Tab value="chat"><Icon name="message" :size="18" /><span class="max-w-full truncate">{{ t('mobileChat') }}</span></Tab>
        <Tab value="voice"><Icon name="mic" :size="18" /><span class="max-w-full truncate">{{ t('mobileVoice') }}</span></Tab>
        <Tab value="more"><Icon name="more" :size="18" /><span class="max-w-full truncate">{{ t('mobileMore') }}</span></Tab>
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

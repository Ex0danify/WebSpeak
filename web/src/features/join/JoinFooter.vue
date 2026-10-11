<template>
  <footer
    class="relative z-2 mx-auto flex min-h-13.5 w-[min(1240px,calc(100%-64px))] items-center border-t border-line bg-surface-0 text-caption text-fg-muted max-compact:min-h-13.25 max-compact:w-[min(100%_-_28px,560px)]"
    role="contentinfo"
  >
    <span>{{ APP_NAME }}</span><span :class="separatorClass">·</span><span>{{ t('teamSpeakClient') }}</span><span class="flex-1 max-compact:hidden"></span><Button variant="soft" size="inline" @click="$emit('clear-local-data')">{{ t('clearLocalData') }}</Button><span :class="separatorClass">·</span><span class="max-compact:ml-auto">{{ t('browserSupport') }}</span>
  </footer>
</template>

<script setup lang="ts">
import { Button } from "@/shared/ui/button";
import { APP_NAME } from "@/shared/lib/brand";
import { useI18n } from "@/shared/i18n/useI18n.js";

defineEmits<{
  (e: "clear-local-data"): void;
}>();

const { t } = useI18n();

const separatorClass = "mx-2 text-line-strong";
</script>

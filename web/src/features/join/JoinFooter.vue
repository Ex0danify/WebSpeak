<template>
  <footer
    class="relative z-2 mx-auto flex min-h-13.5 w-[min(1240px,calc(100%-64px))] items-center border-t border-line bg-surface-0 text-caption text-fg-muted max-compact:min-h-13.25 max-compact:w-[min(100%_-_28px,560px)] max-compact:flex-wrap"
    role="contentinfo"
  >
    <span>{{ APP_NAME }}</span
    ><span :class="separatorClass">·</span><span>{{ t("teamSpeakClient") }}</span
    ><span class="flex-1 max-compact:hidden"></span><span :class="`${separatorClass} compact:hidden`">·</span
    ><Button variant="soft" size="inline" @click="$emit('clear-local-data')">{{ t("clearLocalData") }}</Button
    ><span :class="separatorClass">·</span><span class="max-compact:ml-auto">{{ t("browserSupport") }}</span>
    <nav class="hidden basis-full flex-wrap gap-x-4 max-compact:flex" :aria-label="t('moreLinks')">
      <Button as="a" variant="link" size="inline" :href="CHANGELOG_URL" target="_blank" rel="noreferrer">{{ t("viewChangelog") }}</Button>
      <Button as="a" variant="link" size="inline" href="/admin">{{ t("adminConsole") }}</Button>
      <span class="ml-auto self-center">{{ VERSION_PREFIX }}{{ appVersion }}</span>
    </nav>
  </footer>
</template>

<script setup lang="ts">
import { Button } from "@/shared/ui/button";
import { APP_NAME, CHANGELOG_URL, VERSION_PREFIX } from "@/shared/lib/brand";
import { useI18n } from "@/shared/i18n/useI18n.js";

defineProps<{ appVersion: string }>();

defineEmits<{
  (e: "clear-local-data"): void;
}>();

const { t } = useI18n();

const separatorClass = "mx-2 text-line-strong";
</script>

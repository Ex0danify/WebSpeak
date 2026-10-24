<template>
  <header
    class="flex min-h-20.5 flex-none items-center justify-between border-b border-line bg-surface-1 px-[clamp(24px,4vw,58px)] max-desktop:px-4.5"
  >
    <div>
      <small class="block text-2xs text-fg-muted uppercase">{{ t("adminConsoleTitle") }}</small>
      <h1 class="mt-1 block text-xl font-bold">{{ title }}</h1>
    </div>
    <div class="flex items-center gap-2 text-caption text-fg-muted">
      <Chip variant="success" dot
        ><span class="max-narrow:sr-only">{{ t("gatewayRunning") }}</span></Chip
      ><Button variant="accentSoft" size="sm" class="gap-1.5" :title="themeLabel" :aria-label="themeLabel" @click="$emit('cycle-theme')"
        ><Icon :name="themeIcon" :size="17" /><span class="max-narrow:hidden">{{ themeLabel }}</span></Button
      ><AdminLanguageSwitcher />
    </div>
  </header>
</template>

<script setup lang="ts">
import { Button } from "@/shared/ui/button";
import { Chip } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import AdminLanguageSwitcher from "@/features/admin/shell/AdminLanguageSwitcher.vue";
import { useI18n } from "@/shared/i18n/useI18n";

defineProps<{ title: string; themeIcon: "sun" | "moon"; themeLabel: string }>();
defineEmits<{ (e: "cycle-theme"): void }>();

const { t } = useI18n();
</script>

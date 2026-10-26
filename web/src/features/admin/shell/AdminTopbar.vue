<template>
  <header class="sticky top-0 z-10 border-b border-line bg-surface-1">
    <div :class="cn(adminContainer, 'flex min-h-14 items-center justify-between gap-2')">
      <AdminBrand variant="bar" class="desktop:hidden" />
      <div class="ml-auto flex items-center gap-2 text-caption text-fg-muted">
        <Chip variant="success" dot
          ><span class="max-narrow:sr-only">{{ t("gatewayRunning") }}</span></Chip
        ><Button variant="accentSoft" size="sm" class="gap-1.5" :title="themeLabel" :aria-label="themeLabel" @click="$emit('cycle-theme')"
          ><Icon :name="themeIcon" :size="17" /><span class="max-narrow:hidden">{{ themeLabel }}</span></Button
        ><AdminLanguageSwitcher />
        <AdminAccountMenu />
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Chip } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import AdminAccountMenu from "@/features/admin/shell/AdminAccountMenu.vue";
import AdminBrand from "@/features/admin/shell/AdminBrand.vue";
import AdminLanguageSwitcher from "@/features/admin/shell/AdminLanguageSwitcher.vue";
import { adminContainer } from "@/features/admin/ui/adminPage";
import { useI18n } from "@/shared/i18n/useI18n";

defineProps<{ themeIcon: "sun" | "moon"; themeLabel: string }>();
defineEmits<{ (e: "cycle-theme"): void }>();

const { t } = useI18n();
</script>

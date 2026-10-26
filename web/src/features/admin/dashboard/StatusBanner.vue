<template>
  <div
    class="flex items-center justify-between rounded-lg bg-accent-soft p-6 text-fg max-desktop:items-start max-desktop:gap-5 max-desktop:p-4.5"
  >
    <div>
      <small class="text-2xs font-extrabold tracking-label text-fg-muted">{{ t("systemStatus") }}</small>
      <h2 class="mt-2.25 mb-1.25 text-2xl font-bold">{{ t("everythingRunning") }}</h2>
      <p class="m-0 text-xs text-fg-muted max-desktop:max-w-3/4">{{ t("overviewLead") }}</p>
    </div>
    <Chip variant="success" dot class="max-narrow:hidden">{{ t("running") }}</Chip>
  </div>
</template>

<script setup lang="ts">
import { Chip } from "@/shared/ui/chip";
import { useI18n } from "@/shared/i18n/useI18n";

const { t } = useI18n();
</script>

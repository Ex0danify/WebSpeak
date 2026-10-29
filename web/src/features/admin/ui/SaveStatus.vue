<template>
  <!-- The live region is always there, so a screen reader announces the text that comes into it. -->
  <span role="status" aria-live="polite" class="inline-flex items-center text-2xs text-fg-muted">
    <Transition
      enter-active-class="transition-opacity duration-150 motion-reduce:transition-none"
      leave-active-class="transition-opacity duration-500 motion-reduce:transition-none"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <span
        v-if="status.state !== 'idle'"
        :class="quiet ? 'sr-only' : ['inline-flex items-center gap-1', status.state === 'saved' && 'text-success italic']"
      >
        <Icon v-if="status.state === 'saved' && !quiet" name="check" :size="14" />
        {{ status.state === "saved" ? t("savedStatus") : t("saving") }}
      </span>
    </Transition>
  </span>
</template>

<script setup lang="ts">
import { Icon } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n";
import type { SaveStatus } from "@/features/admin/core/saveStatus";

defineProps<{ status: SaveStatus; quiet?: boolean }>();
const { t } = useI18n();
</script>

<template>
  <!-- Seen only: the section's status says "Saved" to a screen reader, this one marks the control that was saved. -->
  <Transition
    enter-active-class="transition-opacity duration-150 motion-reduce:transition-none"
    leave-active-class="transition-opacity duration-500 motion-reduce:transition-none"
    enter-from-class="opacity-0"
    leave-to-class="opacity-0"
  >
    <span
      v-if="status.state === 'saved'"
      aria-hidden="true"
      :class="cn('inline-flex shrink-0 items-center gap-1 text-2xs leading-5 text-success italic', props.class)"
      ><Icon name="check" :size="14" />{{ t("savedStatus") }}</span
    >
  </Transition>
</template>

<script setup lang="ts">
import { Icon } from "@/shared/ui/icon";
import { cn } from "@/shared/lib/cn";
import { useI18n } from "@/shared/i18n/useI18n";
import type { SaveStatus } from "@/features/admin/core/saveStatus";

const props = defineProps<{ status: SaveStatus; class?: string }>();
const { t } = useI18n();
</script>

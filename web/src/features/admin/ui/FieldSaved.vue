<template>
  <!-- Seen only: the section's status says "Saved" to a screen reader, this one marks the field that was saved. -->
  <Transition
    enter-active-class="transition-opacity duration-150 motion-reduce:transition-none"
    leave-active-class="transition-opacity duration-500 motion-reduce:transition-none"
    enter-from-class="opacity-0"
    leave-to-class="opacity-0"
  >
    <span
      v-if="status.state === 'saved'"
      aria-hidden="true"
      class="ml-2 inline-flex h-4 items-center gap-1 rounded-full bg-success-soft px-2 align-middle text-2xs font-semibold text-success"
    >
      <Icon name="check" :size="12" />{{ t("savedStatus") }}
    </span>
  </Transition>
</template>

<script setup lang="ts">
import { Icon } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n";
import type { SaveStatus } from "@/features/admin/core/saveStatus";

defineProps<{ status: SaveStatus }>();
const { t } = useI18n();
</script>

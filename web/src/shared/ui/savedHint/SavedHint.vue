<template>
  <!-- Seen only: whoever shows it also says "Saved" to a screen reader, this one marks the control that was saved. -->
  <Transition
    enter-active-class="transition-opacity duration-150 motion-reduce:transition-none"
    leave-active-class="transition-opacity duration-500 motion-reduce:transition-none"
    enter-from-class="opacity-0"
    leave-to-class="opacity-0"
  >
    <span
      v-if="status.state === 'saved'"
      aria-hidden="true"
      :class="cn('inline-flex shrink-0 items-center gap-1 text-2xs text-success italic', dense ? 'leading-none' : 'leading-5', props.class)"
      ><Icon name="check" :size="14" />{{ t("savedStatus") }}</span
    >
  </Transition>
</template>

<script setup lang="ts">
import { Icon } from "@/shared/ui/icon";
import { cn } from "@/shared/lib/cn";
import { useI18n } from "@/shared/i18n/useI18n";
import type { SaveStatus } from "@/shared/lib/saveStatus";

// A short "Saved" with a check that fades out, next to the control that was saved. `dense` drops the line height so it
// sits on the line of a label. Whoever shows it also says "Saved" to a screen reader (a live region), this one is only seen.
const props = defineProps<{ status: SaveStatus; dense?: boolean; class?: string }>();
const { t } = useI18n();
</script>

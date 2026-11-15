<template>
  <div
    :class="['min-h-9 flex-1 px-3 py-2.5 text-md max-compact:min-h-11 max-compact:text-sm', failed ? 'text-danger' : 'text-fg-muted']"
    :role="failed ? 'alert' : undefined"
    :aria-busy="failed ? undefined : 'true'"
  >
    <template v-if="failed">{{ t("editorLoadFailed") }}</template>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "@/shared/i18n/useI18n.js";

// Stands where the message box will be while its code loads, with the same height so nothing moves when it arrives. If the
// code cannot be loaded it says so, since there is nothing to type in.
defineProps<{ failed?: boolean }>();

const { t } = useI18n();
</script>

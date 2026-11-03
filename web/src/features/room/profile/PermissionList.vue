<template>
  <div class="flex flex-col gap-3">
    <p class="m-0 text-sm text-fg-muted">{{ t("permissionsHint") }}</p>
    <Input v-model.trim="query" type="search" autocomplete="off" :placeholder="t('permissionsSearch')" :aria-label="t('permissionsSearch')">
      <template #leading><Icon name="search" :size="15" /></template>
    </Input>
    <span aria-live="polite" class="sr-only">{{ entries.length ? t("permissionsCount", { count: entries.length }) : "" }}</span>
    <p v-if="!permissions.length" class="m-0 text-sm text-fg-muted">{{ t("permissionsEmpty") }}</p>
    <p v-else-if="!entries.length" class="m-0 text-sm text-fg-muted">{{ t("permissionsNoMatch") }}</p>
    <ul v-else class="m-0 max-h-64 list-none overflow-y-auto p-0">
      <li
        v-for="entry in entries"
        :key="entry.name"
        class="flex items-center justify-between gap-3 border-b border-line py-1.5 last:border-b-0"
      >
        <code class="min-w-0 font-mono text-xs break-all text-fg">{{ entry.name }}</code>
        <Chip v-if="isFlag(entry)" :variant="entry.value ? 'success' : 'neutral'" class="shrink-0">
          <template v-if="entry.value" #icon><Icon name="check" :size="13" /></template>
          {{ entry.value ? t("permissionStateOn") : t("permissionStateOff") }}
        </Chip>
        <span v-else class="shrink-0 text-sm font-medium text-fg tabular-nums">{{ entry.value }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Chip } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { useI18n } from "@/shared/i18n/useI18n.js";
import type { PermissionEntry } from "@/features/session";

const props = defineProps<{ permissions: PermissionEntry[] }>();
const { t } = useI18n();
const query = ref("");

// TeamSpeak prefixes its boolean permissions with b_, the others carry a number.
const isFlag = (entry: PermissionEntry): boolean => entry.name.startsWith("b_");

const entries = computed(() => {
  const needle = query.value.toLowerCase();
  return props.permissions.filter((entry) => entry.name.includes(needle)).sort((a, b) => a.name.localeCompare(b.name));
});
</script>

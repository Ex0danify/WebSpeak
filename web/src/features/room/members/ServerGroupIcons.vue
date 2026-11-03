<template>
  <div v-if="groups.length" role="group" :aria-label="t('serverGroups')" class="flex flex-none items-center gap-1">
    <Tooltip v-for="group in groups" :key="group.id" :text="group.name">
      <span role="img" :aria-label="group.name" class="inline-flex size-4 items-center justify-center">
        <img v-if="group.src" :src="group.src" alt="" draggable="false" class="size-4 object-contain" />
        <Icon v-else-if="group.builtin" :name="group.builtin.icon" :size="14" :class="group.builtin.tone" />
      </span>
    </Tooltip>
  </div>
</template>

<script setup lang="ts">
import type { MemberGroupIcon } from "@/features/room/members/useMemberGroups.js";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { Icon } from "@/shared/ui/icon";
import { Tooltip } from "@/shared/ui/tooltip";

defineProps<{ groups: readonly MemberGroupIcon[] }>();

const { t } = useI18n();
</script>

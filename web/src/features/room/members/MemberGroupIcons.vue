<template>
  <div v-if="groups.server.length || groups.channel" class="flex flex-none items-center gap-2">
    <div v-if="groups.server.length" role="group" :aria-label="t('serverGroups')" class="flex items-center gap-1">
      <Tooltip v-for="group in groups.server" :key="group.id" :text="group.name">
        <span role="img" :aria-label="group.name" class="inline-flex"><GroupGlyph :group="group" /></span>
      </Tooltip>
    </div>
    <span v-if="groups.server.length && groups.channel" class="h-4 w-px shrink-0 bg-line" aria-hidden="true"></span>
    <div v-if="groups.channel" role="group" :aria-label="t('channelGroup')" class="flex items-center">
      <Tooltip :text="groups.channel.name">
        <span role="img" :aria-label="groups.channel.name" class="inline-flex"><GroupGlyph :group="groups.channel" /></span>
      </Tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import GroupGlyph from "@/features/room/members/GroupGlyph.vue";
import type { MemberGroups } from "@/features/room/members/useMemberGroups.js";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { Tooltip } from "@/shared/ui/tooltip";

// Server groups left, the channel group right behind a divider. The icons carry no text, so each is named for screen readers
// and on hover.
defineProps<{ groups: MemberGroups }>();

const { t } = useI18n();
</script>

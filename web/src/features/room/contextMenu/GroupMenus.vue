<template>
  <MenuSub>
    <template #icon><Icon name="shield" :size="15" /></template>
    <template #label>{{ t("serverGroups") }}</template>
    <MenuCheckItem
      v-for="group in server"
      :key="group.id"
      :checked="member.serverGroups?.includes(group.id) ?? false"
      @select="toggleServerGroup(member, group)"
      ><GroupGlyph :group="iconOf(group.iconId) ?? {}" /><span class="min-w-0 flex-1 truncate">{{ group.name }}</span></MenuCheckItem
    >
    <p v-if="!server.length" class="m-0 px-2.5 py-2 text-xs text-fg-muted">{{ t("noGroupsToAssign") }}</p>
  </MenuSub>
  <MenuSub>
    <template #icon><Icon name="users" :size="15" /></template>
    <template #label>{{ t("channelGroup") }}</template>
    <MenuItem
      v-for="group in channel"
      :key="group.id"
      :current="member.channelGroupId === group.id"
      @select="assignChannelGroup(member, group)"
      ><GroupGlyph :group="iconOf(group.iconId) ?? {}" /><span class="min-w-0 flex-1 truncate">{{ group.name }}</span></MenuItem
    >
    <p v-if="!channel.length" class="m-0 px-2.5 py-2 text-xs text-fg-muted">{{ t("noGroupsToAssign") }}</p>
  </MenuSub>
</template>

<script setup lang="ts">
import GroupGlyph from "@/shared/components/GroupGlyph.vue";
import { Icon } from "@/shared/ui/icon";
import { MenuCheckItem, MenuItem, MenuSub } from "@/shared/ui/menu";
import { useI18n } from "@/shared/i18n/useI18n.js";
import type { ChannelMember } from "@/features/session";
import { useContextActions } from "@/features/room/contextMenuApi.js";
import { useGroupChoices } from "@/features/room/contextMenu/useGroupChoices.js";
import { useGroupIcons } from "@/features/room/useGroupIcons.js";

// The groups of a member as two submenus, like the TeamSpeak client: each with its icon in front of the name, the server groups
// ticked, the channel group the one in effect, and choosing it again gives the default group back. Used by the menu of another
// member and by your own.
defineProps<{ member: ChannelMember }>();

const { t } = useI18n();
const { toggleServerGroup, assignChannelGroup } = useContextActions();
const { server, channel } = useGroupChoices();
const { iconOf } = useGroupIcons();
</script>

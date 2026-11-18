<template>
  <MenuSub v-if="serverFor(live).length">
    <template #icon><Icon name="shield" :size="15" /></template>
    <template #label>{{ t("serverGroups") }}</template>
    <MenuCheckItem
      v-for="group in serverFor(live)"
      :key="group.id"
      :checked="live.serverGroups?.includes(group.id) ?? false"
      @select="keepOpen($event, () => toggleServerGroup(live, group))"
      ><GroupGlyph :group="iconOf(group.iconId) ?? {}" /><span class="min-w-0 flex-1 truncate">{{ group.name }}</span></MenuCheckItem
    >
  </MenuSub>
  <MenuSub v-if="channelFor(live).length">
    <template #icon><Icon name="users" :size="15" /></template>
    <template #label>{{ t("channelGroup") }}</template>
    <MenuItem
      v-for="group in channelFor(live)"
      :key="group.id"
      :current="live.channelGroupId === group.id"
      @select="assignChannelGroup(live, group)"
      ><GroupGlyph :group="iconOf(group.iconId) ?? {}" /><span class="min-w-0 flex-1 truncate">{{ group.name }}</span></MenuItem
    >
  </MenuSub>
</template>

<script setup lang="ts">
import GroupGlyph from "@/shared/components/GroupGlyph.vue";
import { Icon } from "@/shared/ui/icon";
import { MenuCheckItem, MenuItem, MenuSub } from "@/shared/ui/menu";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { type ChannelMember, useSessionStore } from "@/features/session";
import { useContextActions } from "@/features/room/contextMenuApi.js";
import { useGroupChoices } from "@/features/room/contextMenu/useGroupChoices.js";
import { useGroupIcons } from "@/features/room/useGroupIcons.js";

// The groups of a member as two submenus, like the TeamSpeak client: each with its icon in front of the name, the server groups
// ticked, the channel group the one in effect, and choosing it again gives the default group back. Used by the menu of another
// member and by your own. A submenu with nothing the member may give or take is left out.
const props = defineProps<{ member: ChannelMember }>();

const { t } = useI18n();
const { toggleServerGroup, assignChannelGroup } = useContextActions();
const { serverFor, channelFor } = useGroupChoices();
const { iconOf } = useGroupIcons();

// The menu keeps the member it was opened for, which does not change while it stays open. Follow the live entry so the ticks do.
const { channels } = storeToRefs(useSessionStore());
const live = computed(
  () => channels.value.flatMap((channel) => channel.members ?? []).find((entry) => entry.id === props.member.id) ?? props.member,
);

// Server groups come in sets, so the menu stays open to tick the next one. A channel group is a single choice and closes it.
function keepOpen(event: Event, action: () => void | Promise<void>) {
  event.preventDefault();
  void action();
}
</script>

import { storeToRefs } from "pinia";
import { type ChannelMember, type ServerGroup, useSessionStore } from "@/features/session";

const ADD_POWER = "i_group_member_add_power";
const REMOVE_POWER = "i_group_member_remove_power";

/**
 * The groups the menu offers to give or take, like the TeamSpeak client. Only a regular group is one to hand out, and the
 * default one is left out: everybody has it, a member loses it by gaining another and gets it back by losing the last.
 * Then your own power must reach what the group asks for. A power the server did not report is not held. TeamSpeak 6 has
 * no separate channel group powers, the same two cover both kinds of group.
 */
export function useGroupChoices() {
  const { serverGroups, channelGroups, permissions } = storeToRefs(useSessionStore());
  const power = (name: string) => permissions.value.find((entry) => entry.name === name)?.value ?? 0;
  const mayAdd = (group: ServerGroup) => power(ADD_POWER) > 0 && power(ADD_POWER) >= group.addPower;
  const mayRemove = (group: ServerGroup) => power(REMOVE_POWER) > 0 && power(REMOVE_POWER) >= group.removePower;
  const regular = (groups: ServerGroup[]) => groups.filter((group) => group.type === 1 && !group.isDefault);
  return {
    serverFor: (member: ChannelMember) =>
      regular(serverGroups.value).filter((group) => (member.serverGroups?.includes(group.id) ? mayRemove(group) : mayAdd(group))),
    // Choosing the group a member has gives the default one back, so that takes the remove power.
    channelFor: (member: ChannelMember) =>
      regular(channelGroups.value).filter((group) => (member.channelGroupId === group.id ? mayRemove(group) : mayAdd(group))),
  };
}

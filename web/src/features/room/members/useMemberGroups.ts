import { storeToRefs } from "pinia";
import { computed } from "vue";
import { builtinGroupIcon, type BuiltinGroupIcon } from "@/features/room/members/builtinGroupIcons.js";
import { useSessionStore, type ChannelMember } from "@/features/session";

export interface MemberGroupIcon {
  id: number;
  name: string;
  /** A downloaded icon, as a data URL. */
  src?: string;
  builtin?: BuiltinGroupIcon;
}

/**
 * The server groups of a member that have an icon, in the server's display order. A group whose
 * icon is still downloading or failed to load is left out, there is nothing to show for it.
 */
export function useMemberGroups() {
  const { serverGroups, groupIcons } = storeToRefs(useSessionStore());
  const resolved = computed(() => {
    const byId = new Map<number, MemberGroupIcon>();
    for (const group of serverGroups.value) {
      const builtin = builtinGroupIcon(group.iconId);
      const src = groupIcons.value[group.iconId];
      if (builtin) byId.set(group.id, { id: group.id, name: group.name, builtin });
      else if (src) byId.set(group.id, { id: group.id, name: group.name, src });
    }
    return byId;
  });

  return (member: Pick<ChannelMember, "serverGroups">): MemberGroupIcon[] => {
    const ids = new Set(member.serverGroups);
    return [...resolved.value.values()].filter((group) => ids.has(group.id));
  };
}

import { storeToRefs } from "pinia";
import { computed } from "vue";
import { builtinGroupIcon, type BuiltinGroupIcon } from "@/features/room/members/builtinGroupIcons.js";
import { useSessionStore, type ChannelMember, type ServerGroup } from "@/features/session";

/** A group that has an icon to show. */
export interface MemberGroup {
  id: number;
  name: string;
  /** A downloaded icon, as a data URL. */
  src?: string;
  builtin?: BuiltinGroupIcon;
}

export interface MemberGroups {
  /** In the server's display order. */
  server: MemberGroup[];
  /** The group in the member's current channel. */
  channel?: MemberGroup;
}

/**
 * The groups of a member that the member row shows, resolved against the lists the server sent. A group without an icon,
 * or whose icon is still downloading or failed to load, is left out, there is nothing to show for it.
 */
export function useMemberGroups() {
  const { serverGroups, channelGroups, groupIcons } = storeToRefs(useSessionStore());

  const iconOf = (iconId: number): Pick<MemberGroup, "src" | "builtin"> | undefined => {
    const builtin = builtinGroupIcon(iconId);
    if (builtin) return { builtin };
    const src = groupIcons.value[iconId];
    return src ? { src } : undefined;
  };
  const resolve = (groups: readonly ServerGroup[]): Map<number, MemberGroup> =>
    new Map(
      groups.flatMap((group) => {
        const icon = iconOf(group.iconId);
        return icon ? [[group.id, { id: group.id, name: group.name, ...icon }] as const] : [];
      }),
    );
  const server = computed(() => resolve(serverGroups.value));
  const channel = computed(() => resolve(channelGroups.value));

  return {
    groupsFor(member: Pick<ChannelMember, "serverGroups" | "channelGroupId">): MemberGroups {
      const ids = new Set(member.serverGroups);
      const channelGroup = member.channelGroupId ? channel.value.get(member.channelGroupId) : undefined;
      return {
        server: [...server.value.values()].filter((group) => ids.has(group.id)),
        ...(channelGroup ? { channel: channelGroup } : {}),
      };
    },
  };
}

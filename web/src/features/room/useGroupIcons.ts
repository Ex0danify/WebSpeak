import { storeToRefs } from "pinia";
import { useSessionStore } from "@/features/session";
import { builtinGroupIcon, type GroupIcon } from "@/shared/lib/builtinGroupIcons";

/**
 * Where the icon of a group comes from: one of ours for the ids TeamSpeak ships, else the image downloaded for it. Undefined
 * for a group without an icon, or one still downloading or that failed to load. The member rows and the group menus share it.
 */
export function useGroupIcons() {
  const { groupIcons } = storeToRefs(useSessionStore());
  return {
    iconOf(iconId: number): GroupIcon | undefined {
      const builtin = builtinGroupIcon(iconId);
      if (builtin) return { builtin };
      const src = groupIcons.value[iconId];
      return src ? { src } : undefined;
    },
  };
}

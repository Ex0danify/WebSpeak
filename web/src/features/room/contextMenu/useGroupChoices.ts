import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useSessionStore } from "@/features/session";

/**
 * The groups the menu offers to give or take, from the lists the server sent. Only a regular group is one to hand out, and
 * the default one is left out: everybody has it, a member loses it by gaining another and gets it back by losing the last.
 */
export function useGroupChoices() {
  const { serverGroups, channelGroups } = storeToRefs(useSessionStore());
  return {
    server: computed(() => serverGroups.value.filter((group) => group.type === 1 && !group.isDefault)),
    channel: computed(() => channelGroups.value.filter((group) => group.type === 1 && !group.isDefault)),
  };
}

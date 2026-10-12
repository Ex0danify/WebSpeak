import { watch, type Ref } from "vue";
import { serverKey } from "@/shared/lib/format";
import { recordRecentServer, type RecentServer } from "@/shared/services/localPersistence";
import type { VoiceState } from "@/features/session";
import { useJoinFormStore } from "./stores/joinFormStore";

export interface UseServerVisitOptions {
  voiceState: Pick<VoiceState, "connected">;
  identityMaterial: Ref<string>;
}

/** Records the current target as a recent server each time `connected` flips on. Owned by the layout,
 *  not the join page, because the join page is gone by the time the flip is observed. */
export function useServerVisit({ voiceState, identityMaterial }: UseServerVisitOptions): void {
  const form = useJoinFormStore();

  function recordServerVisit(): void {
    const address = form.serverTarget;
    if (!address) return;
    const nickname = form.nickname.trim();
    const channel = form.channel.trim();
    const recent: RecentServer = {
      id: serverKey(address),
      address,
      ...(nickname ? { nickname } : {}),
      ...(form.rememberIdentity && identityMaterial.value ? { identityId: "current" } : {}),
      lastConnectedAt: Date.now(),
      ...(channel ? { lastChannelHint: { name: channel } } : {}),
    };
    void recordRecentServer(recent);
  }

  watch(
    () => voiceState.connected,
    (connected) => {
      if (connected) recordServerVisit();
    },
  );
}

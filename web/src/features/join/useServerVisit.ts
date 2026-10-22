import { watch } from "vue";
import { serverKey } from "@/shared/lib/format";
import { loadLocalPreferences, recordRecentServer, type RecentServer } from "@/shared/services/localPersistence";
import type { VoiceState } from "@/features/session";
import { useJoinFormStore } from "@/features/join/stores/joinFormStore";

export interface UseServerVisitOptions {
  voiceState: Pick<VoiceState, "connected">;
}

/** Records the current target as a recent server each time `connected` flips on. Owned by the layout,
 *  not the join page, because the join page is gone by the time the flip is observed. The identity it
 *  pins comes from the persisted selection, the source of truth once the picker has written it. */
export function useServerVisit({ voiceState }: UseServerVisitOptions): void {
  const form = useJoinFormStore();

  async function recordServerVisit(): Promise<void> {
    const address = form.serverTarget;
    if (!address) return;
    const nickname = form.nickname.trim();
    const channel = form.channel.trim();
    // Captured at the connected flip, before the async preference read, so the recorded time is the
    // moment of connection rather than when the identity lookup resolves.
    const lastConnectedAt = Date.now();
    const selectedIdentityId = (await loadLocalPreferences()).selectedIdentityId;
    const recent: RecentServer = {
      id: serverKey(address),
      address,
      ...(nickname ? { nickname } : {}),
      ...(selectedIdentityId ? { identityId: selectedIdentityId } : {}),
      lastConnectedAt,
      ...(channel ? { lastChannelHint: { name: channel } } : {}),
    };
    void recordRecentServer(recent);
  }

  watch(
    () => voiceState.connected,
    (connected) => {
      if (connected) void recordServerVisit();
    },
  );
}

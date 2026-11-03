import type { VoiceConnection } from "../voiceTypes.js";
import { avatarDataUrl } from "./voiceDirectoryView.js";

/** Sends the browser the server group list when it differs from the last one, then the icons it names. */
export function syncServerGroups(ctx: VoiceConnection): void {
  if (!ctx.state.initialStateSent) return;
  const groups = ctx.tsClient.serverGroups().map(({ id, name, iconId }) => ({ id, name, iconId }));
  const signature = JSON.stringify(groups);
  if (signature !== ctx.entry.serverGroupsSent) {
    ctx.entry.serverGroupsSent = signature;
    ctx.sendJson({ type: "serverGroups", groups });
  }
  void loadGroupIcons(
    ctx,
    groups.map((group) => group.iconId),
  );
}

/** Icons are shared between groups and keyed by content, so each id is fetched once per connection. */
async function loadGroupIcons(ctx: VoiceConnection, iconIds: number[]): Promise<void> {
  const { groupIconCache: cache, groupIconRequests: requests } = ctx.entry;
  const wanted = [...new Set(iconIds)].filter((iconId) => iconId !== 0 && !cache.has(iconId) && !requests.has(iconId));
  for (const iconId of wanted) requests.add(iconId);
  try {
    for (const iconId of wanted) {
      if (!ctx.entry.isAlive || !ctx.state.tsReady) return;
      try {
        const data = await ctx.tsClient.getGroupIcon(iconId);
        const icon = data ? avatarDataUrl(data) : null;
        cache.set(iconId, icon);
        if (icon) ctx.sendJson({ type: "serverGroupIcon", iconId, icon });
      } catch (error: unknown) {
        // Icons are optional, a permission or file-transfer failure must never affect joining or voice.
        cache.set(iconId, null);
        ctx.logger.debug(
          { entryId: ctx.entry.id, iconId, err: error instanceof Error ? error.message : "unknown error" },
          "TeamSpeak server group icon unavailable",
        );
      }
    }
  } finally {
    for (const iconId of wanted) requests.delete(iconId);
  }
}

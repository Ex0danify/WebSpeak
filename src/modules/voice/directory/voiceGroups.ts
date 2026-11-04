import type { TSGroup } from "../../teamspeak/index.js";
import type { VoiceConnection } from "../voiceTypes.js";
import { avatarDataUrl } from "./voiceDirectoryView.js";

/** Sends the browser the server and channel group lists when they differ from the last ones, then the icons they name. */
export function syncGroups(ctx: VoiceConnection): void {
  if (!ctx.state.initialStateSent) return;
  const serverGroups = summarize(ctx.tsClient.serverGroups());
  const channelGroups = summarize(ctx.tsClient.channelGroups());
  if (changed(ctx, "serverGroups", serverGroups)) ctx.sendJson({ type: "serverGroups", groups: serverGroups });
  if (changed(ctx, "channelGroups", channelGroups)) ctx.sendJson({ type: "channelGroups", groups: channelGroups });
  void loadGroupIcons(
    ctx,
    [...serverGroups, ...channelGroups].map((group) => group.iconId),
  );
}

const summarize = (groups: readonly TSGroup[]) => groups.map(({ id, name, iconId }) => ({ id, name, iconId }));

function changed(ctx: VoiceConnection, kind: "serverGroups" | "channelGroups", groups: unknown): boolean {
  const signature = JSON.stringify(groups);
  if (signature === ctx.entry.groupsSent[kind]) return false;
  ctx.entry.groupsSent[kind] = signature;
  return true;
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

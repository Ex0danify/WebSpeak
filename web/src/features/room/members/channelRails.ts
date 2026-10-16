import type { TreeChannel } from "@/features/room/roomTypes.js";

export type RailTone = "line" | "accent";

export interface ChannelRailState {
  /** Verticals running through the whole row, by 1-based column from the unit's left edge. */
  through: { column: number; tone: RailTone }[];
  /** The elbow into this sub-channel: the vertical above its name and the stub toward it. Roots have none. */
  elbow?: { vertical: RailTone; stub: RailTone };
  /** The rail that leaves this channel toward its children, drawn beside its members. Absent without children. */
  descent?: RailTone;
}

/** Rail geometry and tone for every channel. Rails on the way to the joined channel turn accent. */
export function computeChannelRails(channels: readonly TreeChannel[], currentChannelId: string | undefined): Map<string, ChannelRailState> {
  const byId = new Map(channels.map((channel) => [channel.id, channel]));
  const isSub = (channel: TreeChannel) => !channel.spacer && channel.rootId !== channel.id;
  const parentOf = (channel: TreeChannel) => (isSub(channel) ? byId.get(channel.parentID) : undefined);

  const onPath = new Set<string>();
  const strictAncestors = new Set<string>();
  for (let channel = byId.get(currentChannelId ?? ""); channel && !onPath.has(channel.id); channel = parentOf(channel)) {
    onPath.add(channel.id);
    if (channel.id !== currentChannelId) strictAncestors.add(channel.id);
  }

  const nextSibling = new Map<string, string>();
  const lastUnder = new Map<string, string>();
  const parents = new Set<string>();
  for (const channel of channels) {
    if (!isSub(channel)) continue;
    const previous = lastUnder.get(channel.parentID);
    if (previous) nextSibling.set(previous, channel.id);
    lastUnder.set(channel.parentID, channel.id);
    parents.add(channel.parentID);
  }
  const leadsToPath = (id: string) => {
    const next = nextSibling.get(id);
    return next !== undefined && onPath.has(next);
  };

  const rails = new Map<string, ChannelRailState>();
  for (const channel of channels) {
    if (channel.spacer) continue;
    const state: ChannelRailState = { through: [] };
    if (parents.has(channel.id)) state.descent = strictAncestors.has(channel.id) ? "accent" : "line";
    if (isSub(channel)) {
      const column = channel.ancestorLines.length + 1;
      const ancestors: TreeChannel[] = [];
      for (let ancestor = parentOf(channel); ancestor && isSub(ancestor); ancestor = parentOf(ancestor)) ancestors.unshift(ancestor);
      channel.ancestorLines.forEach((running, index) => {
        const ancestor = ancestors[index];
        if (running && ancestor) state.through.push({ column: index + 1, tone: leadsToPath(ancestor.id) ? "accent" : "line" });
      });
      if (!channel.isLastChild) state.through.push({ column, tone: leadsToPath(channel.id) ? "accent" : "line" });
      state.elbow = {
        vertical: onPath.has(channel.id) || leadsToPath(channel.id) ? "accent" : "line",
        stub: onPath.has(channel.id) ? "accent" : "line",
      };
    }
    rails.set(channel.id, state);
  }
  return rails;
}

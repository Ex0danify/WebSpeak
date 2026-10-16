import type { ChannelInfo } from "@/features/session";
import type { TreeChannel } from "@/features/room/roomTypes.js";
import { parseSpacer } from "@/shared/lib/parseSpacer";

type Placed = Omit<TreeChannel, "rootId" | "isLastChild" | "ancestorLines">;

/** The channel list as one ordered, depth-annotated tree: children follow their parent, siblings follow the server's
 *  predecessor links (falling back to list order), and each member knows whether it is you. */
export function buildChannelTree(channels: readonly ChannelInfo[], selfClientId: number | null | undefined): TreeChannel[] {
  const source = [...channels];
  const sourceIndex = new Map(source.map((item, index) => [item.id, index]));
  const enriched = source.map((item) => ({
    ...item,
    members: (item.members ?? []).map((member) => ({ ...member, isSelf: member.id === selfClientId })),
  }));
  const byId = new Map(enriched.map((item) => [item.id, item]));
  const depthCache = new Map<string, number>();

  function depthOf(item: ChannelInfo, visiting = new Set<string>()): number {
    if (depthCache.has(item.id)) return depthCache.get(item.id)!;
    if (!item.parentID || item.parentID === "0" || visiting.has(item.id)) return 0;
    const parent = byId.get(item.parentID);
    const depth = parent ? depthOf(parent, new Set(visiting).add(item.id)) + 1 : 0;
    depthCache.set(item.id, depth);
    return depth;
  }

  const childrenByParent = new Map<string, Placed[]>();
  for (const item of enriched) {
    const spacer = parseSpacer(item.name);
    const channel = { ...item, depth: depthOf(item), ...(spacer && { spacer }) };
    const siblings = childrenByParent.get(channel.parentID) ?? [];
    siblings.push(channel);
    childrenByParent.set(channel.parentID, siblings);
  }

  function orderSiblings(siblings: Placed[]): Placed[] {
    const bySiblingId = new Map(siblings.map((item) => [item.id, item]));
    const successors = new Map<string, Placed[]>();
    const roots: Placed[] = [];
    const sourceOrder = (left: Placed, right: Placed) =>
      (sourceIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (sourceIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER);

    for (const item of siblings) {
      const predecessor = item.order && item.order !== "0" && bySiblingId.has(item.order) ? item.order : "";
      if (!predecessor) roots.push(item);
      else successors.set(predecessor, [...(successors.get(predecessor) ?? []), item]);
    }

    roots.sort(sourceOrder);
    for (const items of successors.values()) items.sort(sourceOrder);

    const ordered: Placed[] = [];
    const visited = new Set<string>();
    const append = (item: Placed) => {
      if (visited.has(item.id)) return;
      visited.add(item.id);
      ordered.push(item);
      for (const successor of successors.get(item.id) ?? []) append(successor);
    };
    for (const root of roots) append(root);
    for (const item of [...siblings].sort(sourceOrder)) append(item);
    return ordered;
  }

  const orderedTree: Placed[] = [];
  // The channel each one hangs under, null for roots. Spacers are always roots and never parents.
  const parentOf = new Map<string, string | null>();
  const visit = (parentID: string, parent: Placed | null) => {
    for (const channel of orderSiblings(childrenByParent.get(parentID) ?? [])) {
      if (parentOf.has(channel.id)) continue;
      parentOf.set(channel.id, channel.spacer ? null : (parent?.id ?? null));
      orderedTree.push(channel);
      visit(channel.id, channel.spacer ? null : channel);
    }
  };
  visit("0", null);
  for (const channel of enriched) {
    if (!parentOf.has(channel.id)) {
      const spacer = parseSpacer(channel.name);
      const fallback = { ...channel, depth: depthOf(channel), ...(spacer && { spacer }) };
      parentOf.set(channel.id, null);
      orderedTree.push(fallback);
      visit(channel.id, spacer ? null : fallback);
    }
  }

  const siblingsOf = new Map<string | null, string[]>();
  for (const channel of orderedTree) {
    const key = parentOf.get(channel.id) ?? null;
    siblingsOf.set(key, [...(siblingsOf.get(key) ?? []), channel.id]);
  }
  const isLastChild = (id: string) => siblingsOf.get(parentOf.get(id) ?? null)!.at(-1) === id;

  return orderedTree.map((channel) => {
    // Ancestors below the root, outermost first: a root draws no rail, so its own column never counts.
    const ancestorLines: boolean[] = [];
    let rootId = channel.id;
    for (let parent = parentOf.get(channel.id) ?? null; parent; parent = parentOf.get(parent) ?? null) {
      rootId = parent;
      if (parentOf.get(parent)) ancestorLines.unshift(!isLastChild(parent));
    }
    return { ...channel, rootId, isLastChild: isLastChild(channel.id), ancestorLines };
  });
}

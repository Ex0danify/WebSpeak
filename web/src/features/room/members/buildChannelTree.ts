import type { ChannelInfo } from "@/features/session";
import type { TreeChannel } from "../roomTypes.js";

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

  const childrenByParent = new Map<string, TreeChannel[]>();
  for (const item of enriched) {
    const channel = { ...item, depth: depthOf(item) };
    const siblings = childrenByParent.get(channel.parentID) ?? [];
    siblings.push(channel);
    childrenByParent.set(channel.parentID, siblings);
  }

  function orderSiblings(siblings: TreeChannel[]): TreeChannel[] {
    const bySiblingId = new Map(siblings.map((item) => [item.id, item]));
    const successors = new Map<string, TreeChannel[]>();
    const roots: TreeChannel[] = [];
    const sourceOrder = (left: TreeChannel, right: TreeChannel) =>
      (sourceIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (sourceIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER);

    for (const item of siblings) {
      const predecessor = item.order && item.order !== "0" && bySiblingId.has(item.order) ? item.order : "";
      if (!predecessor) roots.push(item);
      else successors.set(predecessor, [...(successors.get(predecessor) ?? []), item]);
    }

    roots.sort(sourceOrder);
    for (const items of successors.values()) items.sort(sourceOrder);

    const ordered: TreeChannel[] = [];
    const visited = new Set<string>();
    const append = (item: TreeChannel) => {
      if (visited.has(item.id)) return;
      visited.add(item.id);
      ordered.push(item);
      for (const successor of successors.get(item.id) ?? []) append(successor);
    };
    for (const root of roots) append(root);
    for (const item of [...siblings].sort(sourceOrder)) append(item);
    return ordered;
  }

  const orderedTree: TreeChannel[] = [];
  const visit = (parentID: string) => {
    for (const channel of orderSiblings(childrenByParent.get(parentID) ?? [])) {
      orderedTree.push(channel);
      visit(channel.id);
    }
  };
  visit("0");
  for (const channel of enriched) {
    if (!orderedTree.some((item) => item.id === channel.id)) {
      const fallback = { ...channel, depth: depthOf(channel) };
      orderedTree.push(fallback);
      visit(channel.id);
    }
  }
  return orderedTree;
}

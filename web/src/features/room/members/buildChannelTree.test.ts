import { describe, expect, it } from "vitest";
import type { ChannelInfo } from "@/features/session";
import { buildChannelTree } from "@/features/room/members/buildChannelTree";

const ch = (id: string, parentID = "0", extra: Partial<ChannelInfo> = {}): ChannelInfo => ({ id, parentID, name: id, ...extra });
const byId = (tree: ReturnType<typeof buildChannelTree>) => new Map(tree.map((item) => [item.id, item]));

describe("buildChannelTree rail metadata", () => {
  it("flags the last child of every sibling group", () => {
    const tree = byId(buildChannelTree([ch("a"), ch("a1", "a"), ch("a2", "a"), ch("b")], null));
    expect(tree.get("a1")?.isLastChild).toBe(false);
    expect(tree.get("a2")?.isLastChild).toBe(true);
    expect(tree.get("a")?.isLastChild).toBe(false);
    expect(tree.get("b")?.isLastChild).toBe(true);
  });

  it("keeps a rail running through an ancestor that has a later sibling, across three levels", () => {
    const tree = byId(
      buildChannelTree([ch("r"), ch("x", "r"), ch("x1", "x"), ch("x1a", "x1"), ch("y", "r"), ch("y1", "y"), ch("y1a", "y1")], null),
    );
    expect(tree.get("x")?.ancestorLines).toEqual([]);
    expect(tree.get("x1")?.ancestorLines).toEqual([true]);
    expect(tree.get("x1a")?.ancestorLines).toEqual([true, false]);
    expect(tree.get("y1")?.ancestorLines).toEqual([false]);
    expect(tree.get("y1a")?.ancestorLines).toEqual([false, false]);
  });

  it("gives every channel the id of the root it hangs under", () => {
    const tree = byId(buildChannelTree([ch("r"), ch("c", "r"), ch("g", "c"), ch("other")], null));
    expect(["r", "c", "g", "other"].map((id) => tree.get(id)?.rootId)).toEqual(["r", "r", "r", "other"]);
  });

  it("turns a channel whose parent is missing into a root of its own unit", () => {
    const tree = byId(buildChannelTree([ch("lost", "gone"), ch("lost-child", "lost")], null));
    expect(tree.get("lost")).toMatchObject({ rootId: "lost", depth: 0, ancestorLines: [], isLastChild: true });
    expect(tree.get("lost-child")).toMatchObject({ rootId: "lost", depth: 1, isLastChild: true });
  });

  it("does not let a spacer between roots split a unit or become a parent", () => {
    const tree = buildChannelTree([ch("a"), ch("a1", "a"), ch("sp", "0", { name: "[spacer]" }), ch("b"), ch("inside", "sp")], null);
    const meta = byId(tree);
    expect(tree.map((item) => item.id)).toEqual(["a", "a1", "sp", "inside", "b"]);
    expect(meta.get("a1")?.rootId).toBe("a");
    expect(meta.get("sp")).toMatchObject({ rootId: "sp", ancestorLines: [] });
    expect(meta.get("inside")).toMatchObject({ rootId: "inside", ancestorLines: [] });
    expect(meta.get("b")?.rootId).toBe("b");
  });

  it("terminates on a parent cycle", () => {
    const tree = buildChannelTree([ch("p", "q"), ch("q", "p")], null);
    expect(tree.map((item) => item.id).sort()).toEqual(["p", "q"]);
  });
});

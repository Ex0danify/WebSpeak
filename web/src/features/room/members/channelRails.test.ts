import { describe, expect, it } from "vitest";
import type { ChannelInfo } from "@/features/session";
import { buildChannelTree } from "./buildChannelTree";
import { computeChannelRails } from "./channelRails";

const ch = (id: string, parentID = "0", extra: Partial<ChannelInfo> = {}): ChannelInfo => ({ id, parentID, name: id, ...extra });
const railsFor = (channels: ChannelInfo[], current?: string) => computeChannelRails(buildChannelTree(channels, null), current);

describe("computeChannelRails", () => {
  const tree = [ch("r"), ch("x", "r"), ch("x1", "x"), ch("y", "r")];

  it("gives a root no elbow and a descent only when it has children", () => {
    const rails = railsFor([...tree, ch("solo")]);
    expect(rails.get("r")).toEqual({ through: [], descent: "line" });
    expect(rails.get("solo")).toEqual({ through: [] });
  });

  it("draws an elbow into a sub-channel and keeps its column running while a sibling follows", () => {
    const rails = railsFor(tree);
    expect(rails.get("x")?.elbow).toEqual({ vertical: "line", stub: "line" });
    expect(rails.get("x")?.through).toEqual([{ column: 1, tone: "line" }]);
    expect(rails.get("y")?.through).toEqual([]);
  });

  it("carries the parent's rail past a deeper row while that parent has a later sibling", () => {
    expect(railsFor(tree).get("x1")?.through).toEqual([{ column: 1, tone: "line" }]);
    expect(railsFor([...tree].filter((item) => item.id !== "y")).get("x1")?.through).toEqual([]);
  });

  it("turns the rails on the way to the joined channel accent and leaves the rest alone", () => {
    const rails = railsFor(tree, "y");
    expect(rails.get("r")?.descent).toBe("accent");
    expect(rails.get("x")?.through).toEqual([{ column: 1, tone: "accent" }]);
    expect(rails.get("x")?.elbow).toEqual({ vertical: "accent", stub: "line" });
    expect(rails.get("x1")?.through).toEqual([{ column: 1, tone: "accent" }]);
    expect(rails.get("y")?.elbow).toEqual({ vertical: "accent", stub: "accent" });
  });

  it("colors the descent of every ancestor of the joined channel but not of the channel itself", () => {
    const rails = railsFor([...tree, ch("x1a", "x1")], "x1");
    expect(rails.get("r")?.descent).toBe("accent");
    expect(rails.get("x")?.descent).toBe("accent");
    expect(rails.get("x1")?.descent).toBe("line");
  });

  it("skips spacers", () => {
    const rails = railsFor([ch("a"), ch("sp", "0", { name: "[spacer]" })]);
    expect(rails.has("sp")).toBe(false);
  });
});

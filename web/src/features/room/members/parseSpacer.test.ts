import { describe, expect, it } from "vitest";
import { parseSpacer } from "./parseSpacer";

describe("parseSpacer", () => {
  it.each([
    ["[spacer]Games", { align: "left", text: "Games" }],
    ["[lspacer]Games", { align: "left", text: "Games" }],
    ["[cspacer]Games", { align: "center", text: "Games" }],
    ["[rspacer]Games", { align: "right", text: "Games" }],
    ["[cspacer12] ★ Games ★ ", { align: "center", text: "★ Games ★" }],
    ["[*spacer]-", { align: "repeat", text: "-" }],
    ["[*spacer3]=-", { align: "repeat", text: "=-" }],
  ])("parses %s", (name, expected) => {
    expect(parseSpacer(name)).toEqual(expected);
  });

  it.each(["Lobby", "spacer", "[spacer", "my [cspacer]x", "[*spacer]", "[xspacer]a"])("leaves %s alone", (name) => {
    expect(parseSpacer(name)).toBeNull();
  });
});

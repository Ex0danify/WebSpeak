import { describe, expect, it } from "vitest";
import { buildTeamSpeakCommand, escapeTeamSpeakValue } from "./teamSpeakCommand.js";

describe("escapeTeamSpeakValue / buildTeamSpeakCommand", () => {
  it("escapes backslash, space, slash, pipe, newline and carriage return", () => {
    expect(escapeTeamSpeakValue("a b/c|d\\e\nf\rg")).toBe("a\\sb\\/c\\pd\\\\e\\nf\\rg");
  });

  it("escapes the backslash first so later escapes are not doubled", () => {
    expect(escapeTeamSpeakValue("\\ ")).toBe("\\\\\\s");
  });

  it("builds a command with escaped params in insertion order", () => {
    expect(buildTeamSpeakCommand("streamsignaling", { clid: "5", payload: "a b" })).toBe("streamsignaling clid=5 payload=a\\sb");
    expect(buildTeamSpeakCommand("stopstream", {})).toBe("stopstream");
  });
});

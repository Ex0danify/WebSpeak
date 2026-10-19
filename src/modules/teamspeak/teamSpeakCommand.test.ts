import { describe, expect, it } from "vitest";
import { buildTeamSpeakCommand } from "./teamSpeakCommand.js";

describe("buildTeamSpeakCommand", () => {
  it("builds a command with escaped params in insertion order", () => {
    expect(buildTeamSpeakCommand("streamsignaling", { clid: "5", payload: "a b" })).toBe("streamsignaling clid=5 payload=a\\sb");
    expect(buildTeamSpeakCommand("stopstream", {})).toBe("stopstream");
  });

  // The old gateway escape left tabs and the other control characters raw, which broke the command.
  it("escapes tabs and control characters too", () => {
    expect(buildTeamSpeakCommand("streamsignaling", { payload: "a\tb\vc\u0007d\be\ff|g/h\\i\nj\rk" })).toBe(
      "streamsignaling payload=a\\tb\\vc\\ad\\be\\ff\\pg\\/h\\\\i\\nj\\rk",
    );
  });
});

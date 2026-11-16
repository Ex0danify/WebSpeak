import { describe, expect, it } from "vitest";
import { banSecondsFromNotice } from "./banNotice.js";

describe("banSecondsFromNotice", () => {
  it("reads the time left of a timed ban", () => {
    expect(banSecondsFromNotice('You are banned temporarily. Reason: "spam"\nTry again in 00:59:58')).toBe(3598);
    expect(banSecondsFromNotice("Try again in 00:00:07")).toBe(7);
  });

  it("reads hours beyond a day", () => {
    expect(banSecondsFromNotice("Try again in 167:59:58")).toBe(167 * 3600 + 59 * 60 + 58);
  });

  it("calls a permanent ban 0 seconds", () => {
    expect(banSecondsFromNotice('You are banned permanently. Reason: "bye"')).toBe(0);
  });

  it("knows nothing from a text it does not recognise, or from none", () => {
    expect(banSecondsFromNotice("You are banned")).toBeUndefined();
    expect(banSecondsFromNotice("")).toBeUndefined();
    expect(banSecondsFromNotice(undefined)).toBeUndefined();
  });
});

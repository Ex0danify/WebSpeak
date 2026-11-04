import { describe, expect, it } from "vitest";
import { iconDownloadPath, isBuiltinIconId } from "./iconFiles.js";

describe("iconDownloadPath", () => {
  it("names the file after the unsigned id", () => {
    expect(iconDownloadPath(2242180715)).toBe("/icon_2242180715");
    expect(iconDownloadPath(1000)).toBe("/icon_1000");
  });

  it.each([0, 300, 999, -1, 1.5, 0x1_0000_0000, Number.NaN])("refuses %s", (id) => {
    expect(() => iconDownloadPath(id)).toThrow(RangeError);
  });
});

describe("isBuiltinIconId", () => {
  it.each([
    [0, false],
    [1, true],
    [300, true],
    [999, true],
    [1000, false],
    [2242180715, false],
  ])("id %i is %s", (id, expected) => {
    expect(isBuiltinIconId(id)).toBe(expected);
  });
});

import { describe, expect, it } from "vitest";
import { AdminInputError } from "./adminService.js";
import { asRecord, readLimit, readOptionalNumber, readOptionalString, readSettingsInput, readString } from "./adminRequestParsing.js";

describe("adminRequestParsing", () => {
  it("asRecord rejects non-objects and arrays", () => {
    expect(() => asRecord(null)).toThrow(AdminInputError);
    expect(() => asRecord([])).toThrow(AdminInputError);
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
  });

  it("readString enforces type and length", () => {
    expect(readString({ k: "abc" }, "k", 3)).toBe("abc");
    expect(() => readString({ k: "abcd" }, "k", 3)).toThrow(AdminInputError);
    expect(() => readString({}, "k", 3)).toThrow(AdminInputError);
  });

  it("readOptionalString truncates and defaults to empty", () => {
    expect(readOptionalString({ k: "abcdef" }, "k", 3)).toBe("abc");
    expect(readOptionalString({}, "k", 3)).toBe("");
  });

  it("readOptionalNumber falls back, passes numbers and yields NaN otherwise", () => {
    expect(readOptionalNumber({}, "k", 7)).toBe(7);
    expect(readOptionalNumber({ k: 2 }, "k", 7)).toBe(2);
    expect(readOptionalNumber({ k: "2" }, "k", 7)).toBeNaN();
  });

  it("readLimit clamps to 1..200 and falls back on bad input", () => {
    expect(readLimit("500", 50)).toBe(200);
    expect(readLimit("0", 50)).toBe(1);
    expect(readLimit("abc", 50)).toBe(50);
    expect(readLimit(undefined, 50)).toBe(50);
  });

  it("readSettingsInput normalises actions and relay nodes", () => {
    const input = readSettingsInput({
      target: "ts.example:9987",
      siteName: "Site",
      passwordAction: "replace",
      relaySettingsAction: "bogus",
      relayNodes: [{ id: "n1", name: "N", target: "t", enabled: true, tokenAction: "remove" }],
    });
    expect(input.passwordAction).toBe("replace");
    expect(input.relaySettingsAction).toBe("keep");
    expect(input.relayNodes).toEqual([{ id: "n1", name: "N", target: "t", enabled: true, token: undefined, tokenAction: "remove" }]);
    expect(() => readSettingsInput({ siteName: "x" })).toThrow(AdminInputError);
  });
});

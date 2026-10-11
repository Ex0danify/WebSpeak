import { describe, expect, it } from "vitest";
import { avatarInitial, avatarStyle, formatTime, median, serverKey } from "./format";

describe("median", () => {
  it("returns null for an empty list", () => {
    expect(median([])).toBeNull();
  });

  it("sorts numerically, not as strings", () => {
    expect(median([10, 9, 100])).toBe(10);
  });

  it("takes the upper middle value for an even count", () => {
    expect(median([1, 2, 3, 4])).toBe(3);
  });

  it("does not reorder the caller's array", () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe("serverKey", () => {
  it("trims and lowercases so one server has one favorites key", () => {
    expect(serverKey("  TS.Example.COM:9987 ")).toBe("ts.example.com:9987");
  });
});

describe("avatarInitial", () => {
  it.each([
    ["alice", "A"],
    ["  bob", "B"],
    ["ärger", "Ä"],
    ["張三", "張"],
  ])("uses the first visible character of %j", (name, initial) => {
    expect(avatarInitial(name)).toBe(initial);
  });

  it.each(["", "   "])("falls back to ? for %j", (name) => {
    expect(avatarInitial(name)).toBe("?");
  });
});

describe("formatTime", () => {
  // A local-time timestamp, so the expectation holds in any time zone.
  const at = new Date(2026, 8, 26, 14, 5).getTime();

  it.each(["de"] as const)("shows 24-hour HH:MM in %s", (language) => {
    expect(formatTime(at, language)).toBe("14:05");
  });

  it("shows a 12-hour clock with a day period in English", () => {
    expect(formatTime(at, "en")).toMatch(/^02:05\s?PM$/);
  });

  it("pads the hour to two digits", () => {
    expect(formatTime(new Date(2026, 8, 26, 9, 7).getTime(), "de")).toBe("09:07");
  });
});

describe("avatarStyle", () => {
  it("is deterministic for the same name", () => {
    expect(avatarStyle("Lucas")).toEqual(avatarStyle("Lucas"));
  });

  it("picks different fallback colors for different names", () => {
    expect(avatarStyle("Lucas").background).not.toBe(avatarStyle("Ana").background);
  });

  it("gives self an accent gradient instead of a palette color", () => {
    expect(avatarStyle("Lucas", true).background).toContain("var(--color-accent)");
  });

  it("layers an avatar image over the fallback background when given one", () => {
    const style = avatarStyle("Lucas", false, "https://example.com/a.png");
    expect(style).toMatchObject({ backgroundImage: 'url("https://example.com/a.png")', backgroundPosition: "center", backgroundSize: "cover" });
  });

  it("does not set a background image without an avatar", () => {
    expect(avatarStyle("Lucas")).not.toHaveProperty("backgroundImage");
  });
});

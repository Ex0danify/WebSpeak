import { describe, expect, it } from "vitest";
import { avatarInitial, avatarStyle, formatTime, median, microphoneErrorMessage, serverKey } from "./format";

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

  it.each(["zh", "de", "ru", "ja"] as const)("shows 24-hour HH:MM in %s", (language) => {
    expect(formatTime(at, language)).toBe("14:05");
  });

  it("shows a 12-hour clock with a day period in English", () => {
    expect(formatTime(at, "en")).toMatch(/^02:05\s?PM$/);
  });

  it("pads the hour to two digits", () => {
    expect(formatTime(new Date(2026, 8, 26, 9, 7).getTime(), "de")).toBe("09:07");
  });
});

describe("microphoneErrorMessage", () => {
  it.each([
    ["NotAllowedError", "浏览器未授予麦克风权限"],
    ["NotFoundError", "未找到可用的麦克风"],
    ["NotReadableError", "麦克风可能正被其他程序占用"],
    ["OverconstrainedError", "所选麦克风当前不可用"],
    ["SecurityError", "浏览器阻止了麦克风访问"],
  ])("maps a %s DOMException to its reason", (name, reason) => {
    expect(microphoneErrorMessage(new DOMException("x", name))).toBe(`麦克风访问失败：${reason}`);
  });

  it("uses the fallback for an unknown DOMException name", () => {
    expect(microphoneErrorMessage(new DOMException("x", "AbortError"), "回退")).toBe("麦克风访问失败：回退");
  });

  it("uses the default fallback for a plain Error, even one named like a known reason", () => {
    const error = new Error("denied");
    error.name = "NotAllowedError";
    expect(microphoneErrorMessage(error)).toBe("麦克风访问失败：请检查浏览器权限");
  });

  it.each([undefined, null, "NotAllowedError", { name: "NotAllowedError" }])("does not throw for %j", (value) => {
    expect(microphoneErrorMessage(value)).toBe("麦克风访问失败：请检查浏览器权限");
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
    expect(avatarStyle("Lucas", true).background).toContain("var(--ws-accent)");
  });

  it("layers an avatar image over the fallback background when given one", () => {
    const style = avatarStyle("Lucas", false, "https://example.com/a.png");
    expect(style).toMatchObject({ backgroundImage: 'url("https://example.com/a.png")', backgroundPosition: "center", backgroundSize: "cover" });
  });

  it("does not set a background image without an avatar", () => {
    expect(avatarStyle("Lucas")).not.toHaveProperty("backgroundImage");
  });
});

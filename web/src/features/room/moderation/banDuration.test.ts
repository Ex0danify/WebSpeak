import { describe, expect, it } from "vitest";
import { banSeconds, MAX_BAN_SECONDS } from "@/features/room/moderation/banDuration";

describe("banSeconds", () => {
  it("gives the length of a preset, whatever is typed in the custom fields", () => {
    expect(banSeconds({ preset: "hour", amount: 99, unit: "days" })).toBe(3600);
    expect(banSeconds({ preset: "day", amount: 0, unit: "minutes" })).toBe(86400);
    expect(banSeconds({ preset: "week", amount: Number.NaN, unit: "hours" })).toBe(604800);
    expect(banSeconds({ preset: "month", amount: 1, unit: "hours" })).toBe(30 * 86400);
  });

  it("bans for good with 0 seconds", () => {
    expect(banSeconds({ preset: "permanent", amount: 5, unit: "days" })).toBe(0);
  });

  it("counts a custom length in its unit", () => {
    expect(banSeconds({ preset: "custom", amount: 90, unit: "minutes" })).toBe(5400);
    expect(banSeconds({ preset: "custom", amount: 36, unit: "hours" })).toBe(129600);
    expect(banSeconds({ preset: "custom", amount: 14, unit: "days" })).toBe(14 * 86400);
  });

  it("refuses a custom length that is not a whole, positive number", () => {
    for (const amount of [0, -3, 1.5, Number.NaN]) expect(banSeconds({ preset: "custom", amount, unit: "hours" })).toBeNull();
  });

  it("refuses a custom length the server cannot count, and takes the longest one it can", () => {
    expect(banSeconds({ preset: "custom", amount: 99_999, unit: "days" })).toBeNull();
    const days = Math.floor(MAX_BAN_SECONDS / 86400);
    expect(banSeconds({ preset: "custom", amount: days, unit: "days" })).toBe(days * 86400);
    expect(banSeconds({ preset: "custom", amount: days + 1, unit: "days" })).toBeNull();
  });
});

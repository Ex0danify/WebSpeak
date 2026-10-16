import { describe, expect, it } from "vitest";
import { formatVolumeDb } from "@/features/room/members/volumeDb.js";

describe("formatVolumeDb", () => {
  it("shows unity gain as 0 dB", () => expect(formatVolumeDb(100)).toBe("0 dB"));
  it("shows boosts with a plus sign", () => {
    expect(formatVolumeDb(200)).toBe("+6.0 dB");
    expect(formatVolumeDb(400)).toBe("+12.0 dB");
  });
  it("shows cuts with a minus sign", () => {
    expect(formatVolumeDb(50)).toBe("-6.0 dB");
    expect(formatVolumeDb(10)).toBe("-20.0 dB");
  });
  it("never prints a signed zero for gains that round to unity", () => expect(formatVolumeDb(100.2)).toBe("0 dB"));
  it("shows silence as minus infinity", () => expect(formatVolumeDb(0)).toBe("-∞ dB"));
});

import { describe, expect, it } from "vitest";
import { VoiceRateLimits } from "./voiceRateLimits.js";

describe("VoiceRateLimits", () => {
  it("carries a real-time 50 Hz stream without ever dropping", () => {
    const limits = new VoiceRateLimits(0);
    for (let i = 0; i < 5000; i++) expect(limits.audioFrame(i * 20)).toBe("accept");
  });

  it("drops a burst over the budget without closing", () => {
    const limits = new VoiceRateLimits(0);
    const verdicts = Array.from({ length: 150 }, () => limits.audioFrame(0));
    expect(verdicts.filter((v) => v === "accept")).toHaveLength(100);
    expect(verdicts.filter((v) => v === "drop")).toHaveLength(50);
    expect(verdicts).not.toContain("close");
  });

  it("closes once a flood keeps being dropped", () => {
    const limits = new VoiceRateLimits(0);
    const verdicts = Array.from({ length: 400 }, () => limits.audioFrame(0));
    expect(verdicts).toContain("close");
  });

  it("answers a command flood at most once a second", () => {
    const limits = new VoiceRateLimits(0);
    for (let i = 0; i < 60; i++) expect(limits.textFrame(0)).toEqual({ allowed: true, reply: false });
    expect(limits.textFrame(0)).toEqual({ allowed: false, reply: true });
    expect(limits.textFrame(10)).toEqual({ allowed: false, reply: false });
    expect(limits.textFrame(1000)).toEqual({ allowed: true, reply: false });
  });

  it("lets a steady stream of commands through", () => {
    const limits = new VoiceRateLimits(0);
    for (let i = 0; i < 1000; i++) expect(limits.textFrame(i * 50).allowed).toBe(true);
  });
});

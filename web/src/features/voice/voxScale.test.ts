import { describe, expect, it } from "vitest";
import { DEFAULT_VOX_THRESHOLD } from "@/features/voice/audioConstants";
import { VOX_DB_MAX, VOX_DB_MIN, dbToVox, formatVoxDb, levelToShare, releaseLevel, voxToDb } from "@/features/voice/voxScale";

describe("voxScale", () => {
  it("spans -60 to -22 dB, the clamp of the stored threshold", () => {
    expect([VOX_DB_MIN, VOX_DB_MAX]).toEqual([-60, -22]);
  });

  it("puts the default threshold at -42 dB and round-trips whole decibels", () => {
    expect(voxToDb(DEFAULT_VOX_THRESHOLD)).toBe(-42);
    for (const db of [-60, -42, -30, -22]) expect(voxToDb(dbToVox(db))).toBe(db);
  });

  it("clamps thresholds outside the range", () => {
    expect(voxToDb(0)).toBe(-60);
    expect(voxToDb(1)).toBe(-22);
  });

  it("maps a level to its share of the dB range", () => {
    expect(levelToShare(0)).toBe(0);
    expect(levelToShare(Number.NaN)).toBe(0);
    expect(levelToShare(0.0001)).toBe(0);
    expect(levelToShare(1)).toBe(1);
    expect(levelToShare(dbToVox(-41))).toBeCloseTo(19 / 38);
  });

  it("rises at once and falls off gradually", () => {
    expect(releaseLevel(0.2, 0.9)).toBe(0.9);
    expect(releaseLevel(0.9, 0)).toBeCloseTo(0.72);
    expect(releaseLevel(0, 0)).toBe(0);
  });

  it("formats a value in dB", () => {
    expect(formatVoxDb(-42)).toBe("-42 dB");
  });
});

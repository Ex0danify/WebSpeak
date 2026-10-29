import { describe, expect, it } from "vitest";
import { randomHex } from "@/shared/lib/randomId";

describe("randomHex", () => {
  it("returns two hex characters per byte", () => {
    expect(randomHex()).toMatch(/^[0-9a-f]{8}$/);
    expect(randomHex(16)).toMatch(/^[0-9a-f]{32}$/);
  });

  it("does not repeat", () => {
    expect(new Set(Array.from({ length: 50 }, () => randomHex())).size).toBe(50);
  });
});

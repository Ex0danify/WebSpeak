import { describe, expect, it } from "vitest";
import { PreviewCache } from "./previewCache.js";

describe("PreviewCache", () => {
  it("drops the least recently used entry when the budget is full", () => {
    const cache = new PreviewCache<string>(() => 100);
    cache.set("a", "A", 40, 1000);
    cache.set("b", "B", 40, 1000);
    expect(cache.get("a")).toBe("A");
    cache.set("c", "C", 40, 1000);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe("A");
    expect(cache.get("c")).toBe("C");
    expect(cache.usedBytes).toBe(80);
  });

  it("does not keep an entry that is larger than the whole budget", () => {
    const cache = new PreviewCache<string>(() => 10);
    cache.set("big", "x", 11, 1000);
    expect(cache.size).toBe(0);
  });

  it("forgets an entry after its time", () => {
    let now = 0;
    const cache = new PreviewCache<string>(
      () => 100,
      () => now,
    );
    cache.set("a", "A", 10, 1000);
    now = 999;
    expect(cache.get("a")).toBe("A");
    now = 1000;
    expect(cache.get("a")).toBeUndefined();
    expect(cache.usedBytes).toBe(0);
  });

  it("counts a replaced entry once and follows a changed budget", () => {
    let budget = 100;
    const cache = new PreviewCache<string>(() => budget);
    cache.set("a", "A", 60, 1000);
    cache.set("a", "A2", 30, 1000);
    expect(cache.usedBytes).toBe(30);
    budget = 20;
    cache.set("b", "B", 15, 1000);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("B");
  });
});

import { describe, expect, it } from "vitest";
import { LinkPreviewBudget } from "./sessionBudget.js";

describe("LinkPreviewBudget", () => {
  it("allows a burst of requests and then one per second", () => {
    const budget = new LinkPreviewBudget(0);
    for (let index = 0; index < 8; index++) expect(budget.allowRequest(0)).toBe(true);
    expect(budget.allowRequest(0)).toBe(false);
    expect(budget.allowRequest(1000)).toBe(true);
    expect(budget.allowRequest(1000)).toBe(false);
  });

  it("caps the bytes of one minute and starts over after it", () => {
    const budget = new LinkPreviewBudget(0);
    const mib = 1024 * 1024;
    expect(budget.spendBytes(10 * mib, 1)).toBe(true);
    expect(budget.spendBytes(6 * mib, 2)).toBe(true);
    expect(budget.spendBytes(1, 3)).toBe(false);
    expect(budget.spendBytes(1, 60_001)).toBe(true);
  });

  it("does not count bytes that were refused", () => {
    const budget = new LinkPreviewBudget(0);
    const mib = 1024 * 1024;
    expect(budget.spendBytes(20 * mib, 1)).toBe(false);
    expect(budget.spendBytes(16 * mib, 2)).toBe(true);
  });
});

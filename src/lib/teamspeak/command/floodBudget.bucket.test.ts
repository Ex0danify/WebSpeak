import { describe, expect, it } from "vitest";
import { FloodBudget } from "./floodBudget.js";

describe("FloodBudget", () => {
  it("starts with 5 tokens and refills 4 per second up to 8", () => {
    const budget = new FloodBudget({}, 0);
    for (let i = 0; i < 5; i++) expect(budget.take(0)).toBe(0);
    expect(budget.take(0)).toBe(250);
    expect(budget.take(249)).toBe(1);
    expect(budget.take(250)).toBe(0);
    expect(budget.available(100_000)).toBe(8);
  });

  it("drains after a flood refusal", () => {
    const budget = new FloodBudget({ ratePerSecond: 2, burst: 3, initial: 3 }, 1_000);
    budget.drain(1_000);
    expect(budget.available(1_000)).toBe(0);
    expect(budget.take(1_000)).toBe(500);
    expect(budget.take(1_500)).toBe(0);
  });

  it("ignores a clock that goes back and caps the initial tokens", () => {
    const budget = new FloodBudget({ burst: 2, initial: 10 }, 500);
    expect(budget.available(0)).toBe(2);
    budget.take(500);
    budget.take(500);
    expect(budget.available(400)).toBe(0);
  });

  it("refuses a rate or burst it cannot work with", () => {
    expect(() => new FloodBudget({ ratePerSecond: 0 }, 0)).toThrow(RangeError);
    expect(() => new FloodBudget({ burst: 0.5 }, 0)).toThrow(RangeError);
  });
});

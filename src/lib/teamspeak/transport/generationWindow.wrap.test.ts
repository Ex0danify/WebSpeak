import { describe, expect, it } from "vitest";
import { GenerationWindow, generationOf, idOf, PacketIdCounter } from "./generationWindow.js";

describe("GenerationWindow", () => {
  it("maps ids around the expected one to indexes in the same generation", () => {
    const window = new GenerationWindow(5 * 0x10000 + 100);
    expect(window.resolve(100)).toBe(5 * 0x10000 + 100);
    expect(window.resolve(1124)).toBe(5 * 0x10000 + 1124);
    expect(window.resolve(99)).toBe(5 * 0x10000 + 99);
  });

  it("maps small ids to the next generation shortly before the wrap", () => {
    const window = new GenerationWindow(0xfff0);
    expect(window.resolve(0xffff)).toBe(0xffff);
    expect(window.resolve(0)).toBe(0x10000);
    expect(window.resolve(5)).toBe(0x10005);
    expect(generationOf(window.resolve(5))).toBe(1);
  });

  it("maps large ids to the previous generation shortly after the wrap", () => {
    const window = new GenerationWindow(0x10002);
    expect(window.resolve(0xfffe)).toBe(0xfffe);
    expect(window.resolve(2)).toBe(0x10002);
  });

  it("splits the id space in half at the window edges", () => {
    const window = new GenerationWindow(0x10000);
    expect(window.resolve(0x7fff)).toBe(0x10000 + 0x7fff);
    expect(window.resolve(0x8000)).toBe(0x8000);
  });

  it("gives a negative index for ids just below the start, which counts as old", () => {
    expect(new GenerationWindow().resolve(0xffff)).toBe(-1);
  });

  it("only moves forward", () => {
    const window = new GenerationWindow();
    window.passed(10);
    window.passed(3);
    expect(window.next).toBe(11);
  });
});

describe("PacketIdCounter", () => {
  it("wraps the id into the next generation", () => {
    const counter = new PacketIdCounter(0xffff);
    const last = counter.take();
    const first = counter.take();
    expect([idOf(last), generationOf(last)]).toEqual([0xffff, 0]);
    expect([idOf(first), generationOf(first)]).toEqual([0, 1]);
    expect(counter.next).toBe(0x10001);
  });
});

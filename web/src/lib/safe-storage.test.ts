import { afterEach, describe, expect, it, vi } from "vitest";
import { readStorage, removeStorage, writeStorage } from "./safe-storage";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("safe-storage", () => {
  it("reads, writes and removes like localStorage", () => {
    expect(readStorage("k")).toBeNull();
    expect(writeStorage("k", "v")).toBe(true);
    expect(readStorage("k")).toBe("v");
    removeStorage("k");
    expect(readStorage("k")).toBeNull();
  });

  it("answers null, false and nothing when the storage refuses every call", () => {
    const refuse = () => {
      throw new DOMException("refused", "SecurityError");
    };
    vi.stubGlobal("localStorage", { getItem: refuse, setItem: refuse, removeItem: refuse });
    expect(readStorage("k")).toBeNull();
    expect(writeStorage("k", "v")).toBe(false);
    expect(() => removeStorage("k")).not.toThrow();
  });

  it("copes with a browser that throws when the localStorage property is read", () => {
    const spy = vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(readStorage("k")).toBeNull();
    expect(writeStorage("k", "v")).toBe(false);
    expect(() => removeStorage("k")).not.toThrow();
    spy.mockRestore();
  });

  it("copes with a missing localStorage", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(readStorage("k")).toBeNull();
    expect(writeStorage("k", "v")).toBe(false);
  });
});

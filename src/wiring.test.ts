import { describe, expect, it } from "vitest";

describe("gateway test project", () => {
  it("runs in a node environment", () => {
    expect(typeof process.versions.node).toBe("string");
    expect(typeof window).toBe("undefined");
  });
});

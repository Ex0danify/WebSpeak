import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("web test project", () => {
  it("runs in happy-dom and resolves the @ alias", () => {
    expect(typeof document.createElement).toBe("function");
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});

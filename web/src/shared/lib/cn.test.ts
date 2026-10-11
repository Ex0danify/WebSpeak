import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("joins strings and drops falsy values (clsx)", () => {
    expect(cn("a", false, null, undefined, 0, "b")).toBe("a b");
  });

  it("accepts arrays and conditional objects", () => {
    expect(cn(["a", { b: true, c: false }])).toBe("a b");
  });

  it("lets a later utility override an earlier one of the same group (tailwind-merge)", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("lets a caller class override a variant default, which every ui component relies on", () => {
    expect(cn("rounded-md bg-accent", "rounded-lg")).toBe("bg-accent rounded-lg");
  });

  it("keeps unrelated utilities", () => {
    expect(cn("text-fg", "bg-surface-1")).toBe("text-fg bg-surface-1");
  });

  it("returns an empty string for no input", () => {
    expect(cn()).toBe("");
  });

  it("treats the theme font sizes as sizes, not colors", () => {
    expect(cn("text-fg-muted text-caption")).toBe("text-fg-muted text-caption");
    expect(cn("text-ui text-accent")).toBe("text-ui text-accent");
    expect(cn("text-caption", "text-ui")).toBe("text-ui");
  });
});

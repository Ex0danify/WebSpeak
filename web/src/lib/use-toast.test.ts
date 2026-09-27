import { afterEach, describe, expect, it, vi } from "vitest";
import { dismissToast, toast, useToast } from "./use-toast";

// The queue is module state, so every test starts from an empty one.
afterEach(() => dismissToast());

describe("toast", () => {
  it("accepts a plain string as the title", () => {
    toast("Copied");
    expect(useToast().toasts.value).toMatchObject([{ title: "Copied", variant: "info" }]);
  });

  it("returns increasing ids", () => {
    const first = toast("a");
    const second = toast("b");
    expect(second).toBeGreaterThan(first);
  });

  it("defaults to 5 s, or 10 s when the toast offers an action", () => {
    toast("plain");
    toast({ title: "with action", action: { label: "Retry", onClick: () => {} } });
    expect(useToast().toasts.value.map((t) => t.duration)).toEqual([5000, 10000]);
  });

  it("keeps an explicit duration, including 0 which means until dismissed", () => {
    toast({ title: "sticky", duration: 0 });
    toast({ title: "short", duration: 1200 });
    expect(useToast().toasts.value.map((t) => t.duration)).toEqual([0, 1200]);
  });

  it("carries variant, description and action through", () => {
    const onClick = vi.fn();
    toast({ title: "Failed", description: "Try again", variant: "danger", action: { label: "Retry", onClick } });
    const [item] = useToast().toasts.value;
    expect(item).toMatchObject({ title: "Failed", description: "Try again", variant: "danger" });
    item.action?.onClick();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("drops the oldest toasts beyond four", () => {
    for (const title of ["1", "2", "3", "4", "5", "6"]) toast(title);
    expect(useToast().toasts.value.map((t) => t.title)).toEqual(["3", "4", "5", "6"]);
  });
});

describe("dismissToast", () => {
  it("removes only the toast with that id", () => {
    const a = toast("a");
    toast("b");
    dismissToast(a);
    expect(useToast().toasts.value.map((t) => t.title)).toEqual(["b"]);
  });

  it("clears everything without an id", () => {
    toast("a");
    toast("b");
    dismissToast();
    expect(useToast().toasts.value).toEqual([]);
  });

  it("ignores an unknown id", () => {
    toast("a");
    dismissToast(99999);
    expect(useToast().toasts.value).toHaveLength(1);
  });
});

describe("useToast", () => {
  it("exposes the same queue and functions on every call", () => {
    const one = useToast();
    const two = useToast();
    expect(one.toast).toBe(toast);
    expect(one.dismiss).toBe(dismissToast);
    one.toast("shared");
    expect(two.toasts.value).toHaveLength(1);
  });
});

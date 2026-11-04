import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyToClipboard } from "@/shared/composables/copyToClipboard";
import { dismissToast, useToast } from "@/shared/composables/useToast";

const messages = { copied: "Copied", failed: "Copy failed" };

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

describe("copyToClipboard", () => {
  beforeEach(() => dismissToast());
  afterEach(() => Reflect.deleteProperty(navigator, "clipboard"));

  it("writes the text and confirms with a success toast", async () => {
    const writeText = vi.fn(async () => undefined);
    stubClipboard(writeText);
    copyToClipboard("Ana", messages);
    await vi.waitFor(() => expect(useToast().toasts.value).toHaveLength(1));
    expect(writeText).toHaveBeenCalledWith("Ana");
    expect(useToast().toasts.value[0]).toMatchObject({ title: "Copied", variant: "success" });
  });

  it("reports a refused clipboard with a danger toast", async () => {
    stubClipboard(async () => Promise.reject(new Error("denied")));
    copyToClipboard("Ana", messages);
    await vi.waitFor(() => expect(useToast().toasts.value).toHaveLength(1));
    expect(useToast().toasts.value[0]).toMatchObject({ title: "Copy failed", variant: "danger" });
  });

  it("does nothing without a clipboard", () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    expect(() => copyToClipboard("Ana", messages)).not.toThrow();
    expect(useToast().toasts.value).toHaveLength(0);
  });
});

import { nextTick, ref } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import { useToast } from "@/shared/composables/useToast";
import { useScreenShareErrorNotice } from "@/features/room/shell/useScreenShareErrorNotice";

afterEach(() => useToast().dismiss());

const toasts = () => useToast().toasts.value;

describe("useScreenShareErrorNotice", () => {
  it("toasts a new error as a danger", async () => {
    const error = ref("");
    useScreenShareErrorNotice(error);
    error.value = "Screen sharing was not allowed";
    await nextTick();
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0]).toMatchObject({ title: "Screen sharing failed", description: "Screen sharing was not allowed", variant: "danger" });
  });

  it("stays quiet when the error is cleared", async () => {
    const error = ref("Screen sharing failed");
    useScreenShareErrorNotice(error);
    error.value = "";
    await nextTick();
    expect(toasts()).toHaveLength(0);
  });

  it("toasts again for the next failure", async () => {
    const error = ref("");
    useScreenShareErrorNotice(error);
    error.value = "first";
    await nextTick();
    error.value = "";
    await nextTick();
    error.value = "second";
    await nextTick();
    expect(toasts().map((toast) => toast.description)).toEqual(["first", "second"]);
  });
});

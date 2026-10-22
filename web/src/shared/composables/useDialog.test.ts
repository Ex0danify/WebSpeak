import { describe, expect, it } from "vitest";
import { useDialog, useDialogQueue } from "@/shared/composables/useDialog";

const { confirm, prompt, alert } = useDialog();
const { current, settle } = useDialogQueue();

describe("useDialog", () => {
  it("resolves confirm true when confirmed and false when cancelled", async () => {
    const yes = confirm({ title: "t", confirmLabel: "ok", cancelLabel: "no" });
    expect(current.value?.kind).toBe("confirm");
    settle(current.value!.id, true);
    await expect(yes).resolves.toBe(true);

    const no = confirm({ title: "t", confirmLabel: "ok", cancelLabel: "no" });
    settle(current.value!.id, false);
    await expect(no).resolves.toBe(false);
  });

  it("resolves prompt with the value or null on cancel", async () => {
    const value = prompt({ title: "t", label: "l", confirmLabel: "ok", cancelLabel: "no" });
    settle(current.value!.id, "hi");
    await expect(value).resolves.toBe("hi");

    const cancelled = prompt({ title: "t", label: "l", confirmLabel: "ok", cancelLabel: "no" });
    settle(current.value!.id, null);
    await expect(cancelled).resolves.toBeNull();
  });

  it("resolves alert when acknowledged", async () => {
    const acknowledged = alert({ title: "t", confirmLabel: "ok" });
    settle(current.value!.id, true);
    await expect(acknowledged).resolves.toBeUndefined();
  });

  it("shows one request at a time, in the order raised", async () => {
    const first = confirm({ title: "1", confirmLabel: "ok", cancelLabel: "no" });
    const second = confirm({ title: "2", confirmLabel: "ok", cancelLabel: "no" });
    expect(current.value?.options.title).toBe("1");
    settle(current.value!.id, true);
    await first;
    expect(current.value?.options.title).toBe("2");
    settle(current.value!.id, false);
    await second;
    expect(current.value).toBeNull();
  });

  it("ignores a settle for a request that is no longer active", async () => {
    const pending = confirm({ title: "t", confirmLabel: "ok", cancelLabel: "no" });
    const activeId = current.value!.id;
    settle(activeId + 999, true);
    expect(current.value?.id).toBe(activeId);
    settle(activeId, true);
    await pending;
  });
});

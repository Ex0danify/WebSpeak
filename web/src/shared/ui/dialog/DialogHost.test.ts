import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import DialogHost from "@/shared/ui/dialog/DialogHost.vue";
import { useDialog, useDialogQueue } from "@/shared/composables/useDialog";

const { alert } = useDialog();
const { current, settle } = useDialogQueue();

function body() {
  return document.body.textContent ?? "";
}

describe("DialogHost timed alert", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    // Drain anything a test left open, then restore real timers.
    if (current.value) settle(current.value.id, true);
    vi.useRealTimers();
  });

  it("counts down and acknowledges itself when the timeout elapses", async () => {
    const wrapper = mount(DialogHost, { attachTo: document.body });
    const done = alert({ title: "Heads up", message: "Auto closes", confirmLabel: "OK", timeoutMs: 3000 });
    await nextTick();
    expect(body()).toContain("3s");

    vi.advanceTimersByTime(3000);
    await expect(done).resolves.toBeUndefined();
    await nextTick();
    expect(current.value).toBeNull();
    wrapper.unmount();
  });

  it("shows no countdown and waits for acknowledgement when no timeout is set", async () => {
    const wrapper = mount(DialogHost, { attachTo: document.body });
    let resolved = false;
    void alert({ title: "Heads up", message: "Stay", confirmLabel: "OK" }).then(() => (resolved = true));
    await nextTick();
    expect(body()).not.toMatch(/\d+s/);

    vi.advanceTimersByTime(60000);
    await nextTick();
    expect(resolved).toBe(false);
    expect(current.value).not.toBeNull();
    wrapper.unmount();
  });
});

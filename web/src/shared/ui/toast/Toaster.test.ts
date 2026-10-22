import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import Toaster from "@/shared/ui/toast/Toaster.vue";
import CountdownBar from "@/shared/ui/countdown/CountdownBar.vue";
import { toast, dismissToast } from "@/shared/composables/useToast";

afterEach(() => dismissToast());

describe("Toaster", () => {
  it("stacks several toasts and renders a countdown bar only for the ones that ask for it", async () => {
    const wrapper = mount(Toaster, { attachTo: document.body });
    toast({ title: "plain toast" });
    toast({ title: "timed toast", progress: true });
    await nextTick();

    expect(wrapper.text()).toContain("plain toast");
    expect(wrapper.text()).toContain("timed toast");
    expect(wrapper.findAllComponents(CountdownBar)).toHaveLength(1);

    wrapper.unmount();
  });

  it("shows no bar for a toast kept open with duration 0", async () => {
    const wrapper = mount(Toaster, { attachTo: document.body });
    toast({ title: "sticky", progress: true, duration: 0 });
    await nextTick();
    expect(wrapper.findAllComponents(CountdownBar)).toHaveLength(0);
    wrapper.unmount();
  });
});

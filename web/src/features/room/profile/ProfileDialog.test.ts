import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import ProfileDialog from "@/features/room/profile/ProfileDialog.vue";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ProfileDialog", () => {
  it("shows the titled dialog while open and closes with Done", async () => {
    const wrapper = mount(ProfileDialog, { props: { modelValue: true }, attachTo: document.body });
    await nextTick();
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain("Your profile");
    Array.from(document.body.querySelectorAll("button"))
      .find((b) => b.textContent?.trim() === "Done")
      ?.click();
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([false]);
    wrapper.unmount();
  });
});

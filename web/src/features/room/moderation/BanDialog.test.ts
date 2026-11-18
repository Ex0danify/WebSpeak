import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { Input } from "@/shared/ui/input";
import { ListSelect } from "@/shared/ui/select";
import type { ChannelMember } from "@/features/session";
import BanDialog from "@/features/room/moderation/BanDialog.vue";

const member = { id: 2, nickname: "Ana" } as ChannelMember;

let wrapper: VueWrapper | undefined;
afterEach(() => wrapper?.unmount());

function open() {
  wrapper = mount(BanDialog, { props: { modelValue: true, member }, attachTo: document.body });
  return wrapper;
}

const confirms = (view: VueWrapper) => view.emitted("confirm") ?? [];
const selects = (view: VueWrapper) => view.findAllComponents(ListSelect);
const inputs = (view: VueWrapper) => view.findAllComponents(Input);

async function submit() {
  document.getElementById("ban-form")!.dispatchEvent(new Event("submit", { cancelable: true }));
  await nextTick();
}

const banButton = () => [...document.body.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Ban")!;

describe("BanDialog", () => {
  it("is titled with the member and starts on a day with an empty reason", async () => {
    const view = open();
    await nextTick();
    expect(document.body.textContent).toContain("Ban Ana");
    await submit();
    expect(confirms(view)).toEqual([[86400, ""]]);
  });

  it("hands over the trimmed reason and the length of the chosen preset", async () => {
    const view = open();
    await nextTick();
    inputs(view)[0]!.vm.$emit("update:modelValue", "  spam  ");
    selects(view)[0]!.vm.$emit("update:modelValue", "week");
    await nextTick();
    await submit();
    expect(confirms(view)).toEqual([[604800, "spam"]]);
  });

  it("bans for good with 0 seconds", async () => {
    const view = open();
    await nextTick();
    selects(view)[0]!.vm.$emit("update:modelValue", "permanent");
    await nextTick();
    await submit();
    expect(confirms(view)).toEqual([[0, ""]]);
  });

  it("takes a custom length in its unit", async () => {
    const view = open();
    await nextTick();
    selects(view)[0]!.vm.$emit("update:modelValue", "custom");
    await nextTick();
    inputs(view)[1]!.vm.$emit("update:modelValue", 90);
    selects(view)[1]!.vm.$emit("update:modelValue", "minutes");
    await nextTick();
    await submit();
    expect(confirms(view)).toEqual([[5400, ""]]);
  });

  it("refuses a custom length that makes no sense, says why, and disables the button", async () => {
    const view = open();
    await nextTick();
    selects(view)[0]!.vm.$emit("update:modelValue", "custom");
    await nextTick();
    inputs(view)[1]!.vm.$emit("update:modelValue", 0);
    await nextTick();
    expect(document.body.textContent).toContain("whole number");
    expect(banButton().disabled).toBe(true);
    await submit();
    expect(confirms(view)).toEqual([]);
  });

  it("closes from Cancel without handing anything over", async () => {
    const view = open();
    await nextTick();
    [...document.body.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Cancel")!.click();
    await nextTick();
    expect(view.emitted("update:modelValue")).toEqual([[false]]);
    expect(confirms(view)).toEqual([]);
  });

  it("starts from the defaults again when it is opened for the next member", async () => {
    const view = open();
    await nextTick();
    selects(view)[0]!.vm.$emit("update:modelValue", "permanent");
    inputs(view)[0]!.vm.$emit("update:modelValue", "old reason");
    await nextTick();
    await view.setProps({ modelValue: false });
    await view.setProps({ modelValue: true });
    await nextTick();
    await submit();
    expect(confirms(view)).toEqual([[86400, ""]]);
  });
});

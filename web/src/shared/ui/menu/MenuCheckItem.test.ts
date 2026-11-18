import { mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Menu, MenuCheckItem } from "@/shared/ui/menu";

let wrapper: VueWrapper | undefined;
afterEach(() => {
  wrapper?.unmount();
  vi.unstubAllGlobals();
});

/** A menu that is open, as the popup on desktop or as the sheet on a phone. */
async function openMenu(options: { phone: boolean; checked: boolean; onSelect: (event: Event) => void }) {
  vi.stubGlobal("matchMedia", () => ({ matches: options.phone, addEventListener: () => {}, removeEventListener: () => {} }));
  const Host = defineComponent({
    render: () =>
      h(Menu, { open: true, label: "Groups" }, () => [
        h(MenuCheckItem, { checked: options.checked, onSelect: options.onSelect }, () => "Moderator"),
      ]),
  });
  wrapper = mount(Host, { attachTo: document.body });
  await nextTick();
  await nextTick();
}

const item = (selector: string) => document.body.querySelector<HTMLElement>(selector);

describe("MenuCheckItem in the popup", () => {
  it("is a checkbox menu item that says whether it is on", async () => {
    await openMenu({ phone: false, checked: true, onSelect: () => {} });
    const checked = item('[role="menuitemcheckbox"]')!;
    expect(checked.textContent).toContain("Moderator");
    expect(checked.getAttribute("aria-checked")).toBe("true");
    expect(checked.querySelector(".ui-icon, svg")).not.toBeNull();
  });

  it("says it is off, without a check mark", async () => {
    await openMenu({ phone: false, checked: false, onSelect: () => {} });
    const unchecked = item('[role="menuitemcheckbox"]')!;
    expect(unchecked.getAttribute("aria-checked")).toBe("false");
    expect(unchecked.querySelector("svg")).toBeNull();
  });

  it("raises select when it is chosen", async () => {
    const onSelect = vi.fn();
    await openMenu({ phone: false, checked: false, onSelect });
    item('[role="menuitemcheckbox"]')!.click();
    await nextTick();
    expect(onSelect).toHaveBeenCalledOnce();
  });
});

describe("MenuCheckItem in the sheet", () => {
  it("is a toggle button that says whether it is on", async () => {
    await openMenu({ phone: true, checked: true, onSelect: () => {} });
    const button = item("button[aria-pressed]")!;
    expect(button.textContent).toContain("Moderator");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.querySelector("svg")).not.toBeNull();
  });

  it("is not pressed when it is off", async () => {
    await openMenu({ phone: true, checked: false, onSelect: () => {} });
    const button = item("button[aria-pressed]")!;
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.querySelector("svg")).toBeNull();
  });

  it("raises select and closes the sheet, unless the handler prevents it", async () => {
    await openMenu({ phone: true, checked: false, onSelect: () => {} });
    item("button[aria-pressed]")!.click();
    await nextTick();
    expect(wrapper!.findComponent(Menu).emitted("update:open")?.at(-1)).toEqual([false]);

    wrapper!.unmount();
    await openMenu({ phone: true, checked: false, onSelect: (event) => event.preventDefault() });
    item("button[aria-pressed]")!.click();
    await nextTick();
    expect(wrapper!.findComponent(Menu).emitted("update:open")).toBeUndefined();
  });
});

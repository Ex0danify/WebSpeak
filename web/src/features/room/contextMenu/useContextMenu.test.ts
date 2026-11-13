import { mount } from "@vue/test-utils";
import { defineComponent, nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useContextMenu } from "@/features/room/contextMenu/useContextMenu";
import type { ContextTarget } from "@/features/room/contextMenuApi";
import type { TreeChannel } from "@/features/room/roomTypes";
import type { ChannelMember } from "@/features/session";

type Exposed = Omit<ReturnType<typeof useContextMenu>, "target" | "memberMenu"> & {
  target: ContextTarget | null;
  memberMenu: { member: ChannelMember; x: number; y: number } | null;
};

function member(id: number, nickname: string, overrides: Partial<ChannelMember> = {}): ChannelMember {
  return { id, nickname, ...overrides };
}

const channel = (id: string) => ({ id, name: `Channel ${id}`, members: [] }) as unknown as TreeChannel;

function mountUseContextMenu() {
  const wrapper = mount(defineComponent({ setup: () => useContextMenu(), template: "<div/>" }));
  return { wrapper, vm: wrapper.vm as unknown as Exposed };
}

/** A contextmenu event as the browser dispatches it: `currentTarget` is only set while it is being dispatched. */
function contextmenuOn(element: HTMLElement, init: MouseEventInit = {}): MouseEvent {
  let seen!: MouseEvent;
  element.addEventListener("contextmenu", (event) => (seen = event), { once: true });
  element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, ...init }));
  return Object.defineProperty(seen, "currentTarget", { value: element });
}

function focusable() {
  const element = document.createElement("div");
  element.tabIndex = 0;
  document.body.appendChild(element);
  return element;
}

describe("useContextMenu", () => {
  it("opens the member menu at the click point", async () => {
    const { vm } = mountUseContextMenu();
    vm.open("member", { member: member(2, "Ana") }, new MouseEvent("contextmenu", { clientX: 42, clientY: 84 }));
    await nextTick();
    expect(vm.target).toMatchObject({ kind: "member", x: 42, y: 84 });
    expect(vm.memberMenu).toEqual({ member: member(2, "Ana"), x: 42, y: 84 });
  });

  it("keeps the self menu apart from the member menu", async () => {
    const { vm } = mountUseContextMenu();
    vm.open("self", { member: member(1, "Self", { isSelf: true }) }, new MouseEvent("contextmenu", { clientX: 5, clientY: 6 }));
    await nextTick();
    expect(vm.target).toMatchObject({ kind: "self", x: 5, y: 6 });
    expect(vm.memberMenu).toBeNull();
  });

  it("opens the channel menu and replaces whatever was open", async () => {
    const { vm } = mountUseContextMenu();
    vm.open("member", { member: member(2, "Ana") }, new MouseEvent("contextmenu"));
    vm.open("channel", { channel: channel("7") }, new MouseEvent("contextmenu", { clientX: 9, clientY: 3 }));
    await nextTick();
    expect(vm.target).toMatchObject({ kind: "channel", x: 9, y: 3 });
    expect(vm.memberMenu).toBeNull();
  });

  it("anchors at the origin when an element opens it, like the mobile actions button", async () => {
    const { vm } = mountUseContextMenu();
    vm.open("member", { member: member(3, "Ben") }, document.createElement("div"));
    await nextTick();
    expect(vm.memberMenu).toEqual({ member: member(3, "Ben"), x: 0, y: 0 });
  });

  it("falls back to a fixed point for a keyboard-triggered event", async () => {
    const { vm } = mountUseContextMenu();
    vm.open("channel", { channel: channel("1") }, new Event("contextmenu"));
    await nextTick();
    expect(vm.target).toMatchObject({ x: 20, y: 20 });
  });

  it("closes whichever menu is open when memberMenu is cleared", async () => {
    const { vm } = mountUseContextMenu();
    vm.open("self", { member: member(1, "Self", { isSelf: true }) }, new MouseEvent("contextmenu"));
    vm.memberMenu = null;
    await nextTick();
    expect(vm.target).toBeNull();
  });

  it("divides the click point by --ui-scale for the trigger position", async () => {
    document.documentElement.style.setProperty("--ui-scale", "1.25");
    const { vm } = mountUseContextMenu();
    vm.open("member", { member: member(2, "Ana") }, new MouseEvent("contextmenu", { clientX: 100, clientY: 50 }));
    await nextTick();
    expect(vm.menuStyle).toEqual({ left: "80px", top: "40px" });
    document.documentElement.style.removeProperty("--ui-scale");
  });

  it("returns an empty style when no menu is open", () => {
    const { vm } = mountUseContextMenu();
    expect(vm.menuStyle).toEqual({});
  });

  it.each([
    ["member", (vm: Exposed, e: Event) => vm.open("member", { member: member(5, "Cy") }, e)],
    ["self", (vm: Exposed, e: Event) => vm.open("self", { member: member(5, "Cy", { isSelf: true }) }, e)],
    ["channel", (vm: Exposed, e: Event) => vm.open("channel", { channel: channel("5") }, e)],
  ])("focuses the element that opened the %s menu on close", async (_kind, open) => {
    const { vm } = mountUseContextMenu();
    const opener = focusable();
    const focusSpy = vi.spyOn(opener, "focus");

    open(vm, contextmenuOn(opener));
    await nextTick();
    const closeEvent = new Event("close-auto-focus", { cancelable: true });
    vm.onCloseAutoFocus(closeEvent);

    expect(closeEvent.defaultPrevented).toBe(true);
    expect(focusSpy).toHaveBeenCalledOnce();
    opener.remove();
  });

  it("focuses the anchor element when one opens it", () => {
    const { vm } = mountUseContextMenu();
    const row = focusable();
    const focusSpy = vi.spyOn(row, "focus");
    vm.open("member", { member: member(3, "Ben") }, row);
    vm.onCloseAutoFocus(new Event("close-auto-focus", { cancelable: true }));
    expect(focusSpy).toHaveBeenCalledOnce();
    row.remove();
  });

  it("leaves focus alone when the opener left the page", () => {
    const { vm } = mountUseContextMenu();
    const row = focusable();
    vm.open("member", { member: member(3, "Ben") }, row);
    row.remove();
    const closeEvent = new Event("close-auto-focus", { cancelable: true });
    vm.onCloseAutoFocus(closeEvent);
    expect(closeEvent.defaultPrevented).toBe(false);
  });

  it("does nothing on close-auto-focus when no menu was ever opened", () => {
    const { vm } = mountUseContextMenu();
    const closeEvent = new Event("close-auto-focus", { cancelable: true });
    expect(() => vm.onCloseAutoFocus(closeEvent)).not.toThrow();
    expect(closeEvent.defaultPrevented).toBe(false);
  });
});

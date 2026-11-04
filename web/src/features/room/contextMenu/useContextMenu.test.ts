import { mount } from "@vue/test-utils";
import { defineComponent, nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useContextMenu, type ContextTarget } from "@/features/room/contextMenu/useContextMenu";
import type { TreeChannel } from "@/features/room/roomTypes";
import type { ChannelMember } from "@/features/session";

type Exposed = {
  target: ContextTarget | null;
  memberMenu: { member: ChannelMember; x: number; y: number } | null;
  menuStyle: Record<string, string>;
  openMemberMenu: (member: ChannelMember, event: Event) => void;
  openChannelMenu: (channel: TreeChannel, event: Event) => void;
  openMemberActions: (member: ChannelMember) => void;
  close: () => void;
  onCloseAutoFocus: (event: Event) => void;
};

function member(id: number, nickname: string, overrides: Partial<ChannelMember> = {}): ChannelMember {
  return { id, nickname, ...overrides };
}

const channel = (id: string) => ({ id, name: `Channel ${id}`, members: [] }) as unknown as TreeChannel;

function mountUseContextMenu() {
  const wrapper = mount(defineComponent({ setup: () => useContextMenu(), template: "<div/>" }));
  return { wrapper, vm: wrapper.vm as unknown as Exposed };
}

describe("useContextMenu", () => {
  it("opens the member menu at the click point", async () => {
    const { vm } = mountUseContextMenu();
    vm.openMemberMenu(member(2, "Ana"), new MouseEvent("contextmenu", { clientX: 42, clientY: 84 }));
    await nextTick();
    expect(vm.target).toMatchObject({ kind: "member", x: 42, y: 84 });
    expect(vm.memberMenu).toEqual({ member: member(2, "Ana"), x: 42, y: 84 });
  });

  it("opens the self menu for your own row, which is not a member menu", async () => {
    const { vm } = mountUseContextMenu();
    vm.openMemberMenu(member(1, "Self", { isSelf: true }), new MouseEvent("contextmenu", { clientX: 5, clientY: 6 }));
    await nextTick();
    expect(vm.target).toMatchObject({ kind: "self", x: 5, y: 6 });
    expect(vm.memberMenu).toBeNull();
  });

  it("opens the channel menu and replaces whatever was open", async () => {
    const { vm } = mountUseContextMenu();
    vm.openMemberMenu(member(2, "Ana"), new MouseEvent("contextmenu"));
    vm.openChannelMenu(channel("7"), new MouseEvent("contextmenu", { clientX: 9, clientY: 3 }));
    await nextTick();
    expect(vm.target).toMatchObject({ kind: "channel", x: 9, y: 3 });
    expect(vm.memberMenu).toBeNull();
  });

  it("opens at the origin for the mobile actions trigger and ignores the self row", async () => {
    const { vm } = mountUseContextMenu();
    vm.openMemberActions(member(3, "Ben"));
    await nextTick();
    expect(vm.memberMenu).toEqual({ member: member(3, "Ben"), x: 0, y: 0 });

    vm.openMemberActions(member(1, "Self", { isSelf: true }));
    await nextTick();
    expect(vm.memberMenu?.member.id).toBe(3);
  });

  it("closes whichever menu is open when memberMenu is cleared", async () => {
    const { vm } = mountUseContextMenu();
    vm.openMemberMenu(member(1, "Self", { isSelf: true }), new MouseEvent("contextmenu"));
    vm.memberMenu = null;
    await nextTick();
    expect(vm.target).toBeNull();
  });

  it("divides the click point by --ui-scale for the trigger position", async () => {
    document.documentElement.style.setProperty("--ui-scale", "1.25");
    const { vm } = mountUseContextMenu();
    vm.openMemberMenu(member(2, "Ana"), new MouseEvent("contextmenu", { clientX: 100, clientY: 50 }));
    await nextTick();
    expect(vm.menuStyle).toEqual({ left: "80px", top: "40px" });
    document.documentElement.style.removeProperty("--ui-scale");
  });

  it("returns an empty style when no menu is open", () => {
    const { vm } = mountUseContextMenu();
    expect(vm.menuStyle).toEqual({});
  });

  it.each([
    ["member", "data-member-id", (vm: Exposed) => vm.openMemberMenu(member(5, "Cy"), new MouseEvent("contextmenu"))],
    ["self", "data-member-id", (vm: Exposed) => vm.openMemberMenu(member(5, "Cy", { isSelf: true }), new MouseEvent("contextmenu"))],
    ["channel", "data-channel-id", (vm: Exposed) => vm.openChannelMenu(channel("5"), new MouseEvent("contextmenu"))],
  ])("focuses the opener on close for the %s menu", async (_kind, attribute, open) => {
    const { vm } = mountUseContextMenu();
    const opener = document.createElement("div");
    opener.setAttribute(attribute, "5");
    opener.tabIndex = 0;
    document.body.appendChild(opener);
    const focusSpy = vi.spyOn(opener, "focus");

    open(vm);
    await nextTick();
    const closeEvent = new Event("close-auto-focus", { cancelable: true });
    vm.onCloseAutoFocus(closeEvent);

    expect(closeEvent.defaultPrevented).toBe(true);
    expect(focusSpy).toHaveBeenCalledOnce();
    document.body.removeChild(opener);
  });

  it("does nothing on close-auto-focus when no menu was ever opened", () => {
    const { vm } = mountUseContextMenu();
    const closeEvent = new Event("close-auto-focus", { cancelable: true });
    expect(() => vm.onCloseAutoFocus(closeEvent)).not.toThrow();
    expect(closeEvent.defaultPrevented).toBe(false);
  });
});

import { mount } from "@vue/test-utils";
import { defineComponent, nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useMemberMenu } from "./useMemberMenu";
import type { ChannelMember } from "@/features/session";

type Exposed = {
  memberMenu: { member: ChannelMember; x: number; y: number } | null;
  memberMenuStyle: Record<string, string>;
  openMemberMenu: (member: ChannelMember, event: Event) => void;
  openMemberActions: (member: ChannelMember) => void;
  onMemberMenuCloseAutoFocus: (event: Event) => void;
};

function member(id: number, nickname: string, overrides: Partial<ChannelMember> = {}): ChannelMember {
  return { id, nickname, ...overrides };
}

function mountUseMemberMenu() {
  const wrapper = mount(defineComponent({ setup: () => useMemberMenu(), template: "<div/>" }));
  return { wrapper, vm: wrapper.vm as unknown as Exposed };
}

describe("useMemberMenu", () => {
  it("opens at the click point and ignores the self row", async () => {
    const { vm } = mountUseMemberMenu();
    const event = new MouseEvent("contextmenu", { clientX: 42, clientY: 84 });
    vm.openMemberMenu(member(2, "Ana"), event);
    await nextTick();
    expect(vm.memberMenu).toEqual({ member: member(2, "Ana"), x: 42, y: 84 });

    vm.openMemberMenu(member(1, "Self", { isSelf: true }), event);
    await nextTick();
    expect(vm.memberMenu?.member.id).toBe(2);
  });

  it("opens at the origin for the mobile actions trigger and ignores the self row", async () => {
    const { vm } = mountUseMemberMenu();
    vm.openMemberActions(member(3, "Ben"));
    await nextTick();
    expect(vm.memberMenu).toEqual({ member: member(3, "Ben"), x: 0, y: 0 });

    vm.openMemberActions(member(1, "Self", { isSelf: true }));
    await nextTick();
    expect(vm.memberMenu?.member.id).toBe(3);
  });

  it("divides the click point by --ui-scale for the trigger position", async () => {
    document.documentElement.style.setProperty("--ui-scale", "1.25");
    const { vm } = mountUseMemberMenu();
    vm.openMemberMenu(member(2, "Ana"), new MouseEvent("contextmenu", { clientX: 100, clientY: 50 }));
    await nextTick();
    expect(vm.memberMenuStyle).toEqual({ left: "80px", top: "40px" });
    document.documentElement.style.removeProperty("--ui-scale");
  });

  it("returns an empty style when no menu is open", () => {
    const { vm } = mountUseMemberMenu();
    expect(vm.memberMenuStyle).toEqual({});
  });

  it("focuses the opener's row on close, per member id", async () => {
    const { vm } = mountUseMemberMenu();
    const row = document.createElement("div");
    row.setAttribute("data-member-id", "5");
    row.tabIndex = 0;
    document.body.appendChild(row);
    const focusSpy = vi.spyOn(row, "focus");

    vm.openMemberMenu(member(5, "Cy"), new MouseEvent("contextmenu"));
    await nextTick();
    const closeEvent = new Event("close-auto-focus", { cancelable: true });
    vm.onMemberMenuCloseAutoFocus(closeEvent);

    expect(closeEvent.defaultPrevented).toBe(true);
    expect(focusSpy).toHaveBeenCalledOnce();
    document.body.removeChild(row);
  });

  it("does nothing on close-auto-focus when no menu was ever opened", () => {
    const { vm } = mountUseMemberMenu();
    const closeEvent = new Event("close-auto-focus", { cancelable: true });
    expect(() => vm.onMemberMenuCloseAutoFocus(closeEvent)).not.toThrow();
    expect(closeEvent.defaultPrevented).toBe(false);
  });
});

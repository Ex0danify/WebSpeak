import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ChannelRow from "@/features/room/members/ChannelRow.vue";
import type { TreeChannel } from "@/features/room/roomTypes";

const channel: TreeChannel = {
  id: "2",
  parentID: "0",
  name: "Public",
  depth: 0,
  members: [],
  rootId: "2",
  isLastChild: true,
  ancestorLines: [],
};

function mountRow(extra: Partial<TreeChannel> = {}) {
  return mount(ChannelRow, { props: { channel: { ...channel, ...extra }, active: false, dragOver: false } });
}

describe("ChannelRow password marker", () => {
  it("shows a lock with screen reader text for a protected channel", () => {
    const wrapper = mountRow({ hasPassword: true });
    expect(wrapper.find(".sr-only").text()).toBe("Password protected");
    expect(wrapper.find("svg").exists()).toBe(true);
  });

  it("shows nothing for an open channel", () => {
    expect(mountRow().text()).not.toContain("Password protected");
  });
});

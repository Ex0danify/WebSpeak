import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import MemberRow from "@/features/room/members/MemberRow.vue";
import type { ChannelMember } from "@/features/session";

const member: ChannelMember = { id: 2, nickname: "Ana" };

function mountRow(props: { mutedLocally?: boolean } = {}) {
  return mount(MemberRow, { props: { member, speaking: false, isMobileViewport: false, ...props } });
}

describe("MemberRow local mute badge", () => {
  it("shows the online dot and no badge for an unmuted member", () => {
    const wrapper = mountRow();
    expect(wrapper.find('[aria-label="Muted by you"]').exists()).toBe(false);
    expect(wrapper.find(".bg-success").exists()).toBe(true);
  });

  it("swaps the online dot for the badge while muted on this client", () => {
    const wrapper = mountRow({ mutedLocally: true });
    expect(wrapper.find('[role="img"][aria-label="Muted by you"]').exists()).toBe(true);
    expect(wrapper.find(".bg-success").exists()).toBe(false);
  });

  it("keeps the server-side mute icons separate from the local badge", () => {
    const wrapper = mount(MemberRow, {
      props: { member: { ...member, outputMuted: true }, speaking: false, isMobileViewport: false },
    });
    expect(wrapper.find('[aria-label="Output muted"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Muted by you"]').exists()).toBe(false);
  });
});

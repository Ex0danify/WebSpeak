import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import MemberRow from "@/features/room/members/MemberRow.vue";
import type { ChannelMember } from "@/features/session";
import type { ScreenShareStream } from "@/features/screenShare";

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

describe("MemberRow talk power badge", () => {
  const blocked = (extra: Partial<ChannelMember> = {}) =>
    mount(MemberRow, { props: { member: { ...member, ...extra }, speaking: false, talkBlocked: true, isMobileViewport: false } });

  it("marks the avatar with a labelled badge in place of the online dot, and leaves the status line alone", () => {
    const wrapper = blocked({ isSelf: true });
    expect(wrapper.find('[role="img"][aria-label="No talk power"]').exists()).toBe(true);
    expect(wrapper.find(".bg-success").exists()).toBe(false);
    expect(wrapper.text()).toContain("Your device");
  });

  it("shows no badge by default", () => {
    expect(mountRow().find('[aria-label="No talk power"]').exists()).toBe(false);
  });
});

describe("MemberRow away state", () => {
  function mountAway(extra: Partial<ChannelMember>) {
    return mount(MemberRow, { props: { member: { ...member, away: true, ...extra }, speaking: false, isMobileViewport: false } });
  }

  it("turns the status dot amber and labels the away state", () => {
    const wrapper = mountAway({});
    expect(wrapper.find(".bg-warning").exists()).toBe(true);
    expect(wrapper.find(".bg-success").exists()).toBe(false);
    expect(wrapper.text()).toContain("Away");
  });

  it("shows the away message on the status line", () => {
    const wrapper = mountAway({ awayMessage: "back in 5" });
    expect(wrapper.text()).toContain("back in 5");
  });
});

describe("MemberRow server groups", () => {
  it("shows the icons of the member's server and channel group, named for screen readers", () => {
    const wrapper = mount(MemberRow, {
      props: {
        member,
        speaking: false,
        isMobileViewport: false,
        groups: {
          server: [{ id: 7, name: "Normal", src: "data:image/png;base64,AAAA" }],
          channel: { id: 5, name: "Channel Admin", builtin: { icon: "star", tone: "text-warning" } },
        },
      },
    });
    expect(wrapper.find('[role="img"][aria-label="Normal"]').exists()).toBe(true);
    expect(wrapper.find('[role="img"][aria-label="Channel Admin"]').exists()).toBe(true);
  });

  it("has no group container without icons", () => {
    const row = mountRow();
    expect(row.find('[aria-label="Server groups"]').exists()).toBe(false);
    expect(row.find('[aria-label="Channel group"]').exists()).toBe(false);
  });
});

describe("MemberRow screen share", () => {
  const stream: ScreenShareStream = {
    streamId: "s1",
    source: "browser",
    ownerPeerId: "p1",
    ownerClientId: 2,
    ownerNickname: "Ana",
    name: "Screen",
    audio: false,
    createdAt: 0,
    viewerCount: 0,
    viewers: [],
  };

  it("shows nothing without a stream", () => {
    const wrapper = mountRow();
    expect(wrapper.text()).not.toContain("Live");
    expect(wrapper.find('[aria-label="Watch screen"]').exists()).toBe(false);
  });

  it("marks a sharing member as live and offers to watch", async () => {
    const wrapper = mount(MemberRow, { props: { member, speaking: false, isMobileViewport: false, stream } });
    expect(wrapper.text()).toContain("Live");
    const watch = wrapper.get('button[aria-label="Watch screen"]');
    expect(watch.attributes("aria-pressed")).toBe("false");
    await watch.trigger("click");
    expect(wrapper.emitted("toggle-screen-share")).toHaveLength(1);
  });

  it("reports the watching state as pressed", () => {
    const wrapper = mount(MemberRow, { props: { member, speaking: false, isMobileViewport: false, stream, watching: true } });
    expect(wrapper.get('button[aria-label="Watch screen"]').attributes("aria-pressed")).toBe("true");
  });

  it("shows the badge for a member who shares in another channel, without a way to watch", () => {
    const wrapper = mount(MemberRow, { props: { member: { ...member, streaming: true }, speaking: false, isMobileViewport: false } });
    expect(wrapper.text()).toContain("Live");
    expect(wrapper.find('[aria-label="Watch screen"]').exists()).toBe(false);
  });

  it("does not offer to watch your own share", () => {
    const wrapper = mount(MemberRow, { props: { member: { ...member, isSelf: true }, speaking: false, isMobileViewport: false, stream } });
    expect(wrapper.text()).toContain("Live");
    expect(wrapper.find('[aria-label="Watch screen"]').exists()).toBe(false);
  });
});

describe("MemberRow cursor", () => {
  const row = () => mount(MemberRow, { props: { member, speaking: false, isMobileViewport: false }, attrs: { draggable: "true" } });
  const press = (button: number) => {
    const wrapper = row();
    return wrapper.trigger("pointerdown", { button }).then(() => wrapper);
  };

  it("shows the grab cursor only while the primary button is held on a draggable row", async () => {
    const wrapper = await press(0);
    expect(wrapper.classes()).toContain("cursor-grabbing");
    await wrapper.trigger("pointerup");
    expect(wrapper.classes()).toContain("cursor-context-menu");
  });

  it("keeps the context-menu cursor on a right click", async () => {
    const wrapper = await press(2);
    expect(wrapper.classes()).toContain("cursor-context-menu");
    expect(wrapper.classes()).not.toContain("cursor-grabbing");
  });

  it("keeps the context-menu cursor on a row that cannot be dragged", async () => {
    const wrapper = mount(MemberRow, { props: { member, speaking: false, isMobileViewport: false } });
    await wrapper.trigger("pointerdown", { button: 0 });
    expect(wrapper.classes()).toContain("cursor-context-menu");
  });
});

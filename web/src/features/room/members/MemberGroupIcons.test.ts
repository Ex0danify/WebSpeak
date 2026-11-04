import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import MemberGroupIcons from "@/features/room/members/MemberGroupIcons.vue";
import { builtinGroupIcon } from "@/features/room/members/builtinGroupIcons";

const server = [
  { id: 6, name: "Server Admin", builtin: builtinGroupIcon(300) },
  { id: 7, name: "Normal", src: "data:image/png;base64,AAAA" },
];
const channel = { id: 5, name: "Channel Admin", builtin: builtinGroupIcon(100) };

describe("MemberGroupIcons", () => {
  it("names every icon by its group, in a labelled group per kind", () => {
    const wrapper = mount(MemberGroupIcons, { props: { groups: { server, channel } } });
    const servers = wrapper.get('[role="group"][aria-label="Server groups"]');
    const channels = wrapper.get('[role="group"][aria-label="Channel group"]');
    expect(servers.findAll('[role="img"]').map((icon) => icon.attributes("aria-label"))).toEqual(["Server Admin", "Normal"]);
    expect(channels.findAll('[role="img"]').map((icon) => icon.attributes("aria-label"))).toEqual(["Channel Admin"]);
  });

  it("puts the server groups left and the channel group right, behind a divider", () => {
    const wrapper = mount(MemberGroupIcons, { props: { groups: { server, channel } } });
    const [first, divider, last] = wrapper.get("div").element.children;
    expect(first!.getAttribute("aria-label")).toBe("Server groups");
    expect(divider!.classList.contains("w-px")).toBe(true);
    expect(last!.getAttribute("aria-label")).toBe("Channel group");
  });

  it("draws no divider when one side is empty", () => {
    const onlyServer = mount(MemberGroupIcons, { props: { groups: { server } } });
    const onlyChannel = mount(MemberGroupIcons, { props: { groups: { server: [], channel } } });
    expect(onlyServer.find(".w-px").exists()).toBe(false);
    expect(onlyServer.find('[aria-label="Channel group"]').exists()).toBe(false);
    expect(onlyChannel.find(".w-px").exists()).toBe(false);
    expect(onlyChannel.find('[aria-label="Server groups"]').exists()).toBe(false);
  });

  it("shows a downloaded icon as a picture that cannot start a drag, and a built-in one as a glyph", () => {
    const wrapper = mount(MemberGroupIcons, { props: { groups: { server } } });
    const image = wrapper.get("img");
    expect(image.attributes("src")).toBe("data:image/png;base64,AAAA");
    expect(image.attributes("alt")).toBe("");
    expect(image.attributes("draggable")).toBe("false");
    expect(wrapper.findAll("svg")).toHaveLength(1);
  });

  it("renders nothing without groups", () => {
    expect(mount(MemberGroupIcons, { props: { groups: { server: [] } } }).html()).toBe("<!--v-if-->");
  });
});

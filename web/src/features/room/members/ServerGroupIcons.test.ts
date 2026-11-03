import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ServerGroupIcons from "@/features/room/members/ServerGroupIcons.vue";
import { builtinGroupIcon } from "@/features/room/members/builtinGroupIcons";

const groups = [
  { id: 3, name: "Server Admin", builtin: builtinGroupIcon(300) },
  { id: 6, name: "Owner", src: "data:image/png;base64,AAAA" },
];

describe("ServerGroupIcons", () => {
  it("names every icon by its group, as a labelled group of images", () => {
    const wrapper = mount(ServerGroupIcons, { props: { groups } });
    expect(wrapper.get('[role="group"]').attributes("aria-label")).toBe("Server groups");
    expect(wrapper.findAll('[role="img"]').map((icon) => icon.attributes("aria-label"))).toEqual(["Server Admin", "Owner"]);
  });

  it("shows a downloaded icon as a picture that cannot start a drag, and a built-in one as a glyph", () => {
    const wrapper = mount(ServerGroupIcons, { props: { groups } });
    const image = wrapper.get("img");
    expect(image.attributes("src")).toBe("data:image/png;base64,AAAA");
    expect(image.attributes("alt")).toBe("");
    expect(image.attributes("draggable")).toBe("false");
    expect(wrapper.findAll("svg")).toHaveLength(1);
  });

  it("renders nothing without groups", () => {
    expect(mount(ServerGroupIcons, { props: { groups: [] } }).html()).toBe("<!--v-if-->");
  });
});

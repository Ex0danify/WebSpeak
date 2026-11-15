import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ChatFileCard from "@/features/room/chat/ChatFileCard.vue";

describe("ChatFileCard", () => {
  it("shows the name, the size and that the file is not available", () => {
    const wrapper = mount(ChatFileCard, { props: { file: { fileName: "image_1.png", fileSize: 25831 } } });
    expect(wrapper.text()).toContain("image_1.png");
    expect(wrapper.text()).toMatch(/25[.,]2 KB/);
    expect(wrapper.text()).toContain("MyTeamSpeak");
    expect(wrapper.get("[role=group]").attributes("aria-label")).toContain("image_1.png");
  });

  it("shows the caption only when there is one", () => {
    const plain = mount(ChatFileCard, { props: { file: { fileName: "a.png", fileSize: 1 } } });
    const captioned = mount(ChatFileCard, { props: { file: { fileName: "a.png", fileSize: 1, description: "my caption" } } });
    expect(plain.text()).not.toContain("my caption");
    expect(captioned.text()).toContain("my caption");
  });
});

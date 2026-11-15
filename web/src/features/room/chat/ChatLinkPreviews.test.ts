import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import ChatLinkPreviews from "@/features/room/chat/ChatLinkPreviews.vue";
import { createLinkPreviews, provideLinkPreviews } from "@/features/room/chat/useLinkPreviews";
import type { LinkPreviewData } from "@/features/session";

const DATA = "data:image/png;base64,AAAA";

function render(text: string, answer: (url: string, full?: boolean) => Promise<LinkPreviewData>) {
  const request = vi.fn(answer);
  const previews = createLinkPreviews(request);
  // The room provides the previews from its setup, so the harness does the same.
  const Room = defineComponent({
    setup() {
      provideLinkPreviews(previews);
      return () => h(ChatLinkPreviews, { text });
    },
  });
  return { wrapper: mount(Room), request, previews };
}
const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
};
const failure = (code: string) => Object.assign(new Error(code), { code });

beforeEach(() => localStorage.clear());

describe("ChatLinkPreviews", () => {
  it("draws a page card as text with a link and a decorative picture", async () => {
    const { wrapper } = render("see https://a.example/post", async (url) => ({
      kind: "page",
      url,
      siteName: "Example",
      title: "<b>Title</b>",
      description: "About it",
      image: { mime: "image/png", bytes: 4, dataUri: DATA },
    }));
    await settle();
    expect(wrapper.find("article").attributes("aria-label")).toBe("<b>Title</b>");
    expect(wrapper.text()).toContain("Example");
    expect(wrapper.text()).toContain("About it");
    expect(wrapper.find("b").exists()).toBe(false);
    const link = wrapper.find("a");
    expect(link.text()).toBe("<b>Title</b>");
    expect(link.attributes()).toMatchObject({ href: "https://a.example/post", target: "_blank", rel: "noopener noreferrer" });
    const picture = wrapper.find("img");
    expect(picture.attributes()).toMatchObject({ src: DATA, alt: "", referrerpolicy: "no-referrer" });
  });

  it("draws an image with a text alternative that names the host", async () => {
    const { wrapper } = render("https://pics.example/cat.png", async (url) => ({
      kind: "image",
      url,
      image: { mime: "image/png", bytes: 4, dataUri: DATA },
    }));
    await settle();
    expect(wrapper.find("img").attributes("alt")).toBe("Image from pics.example");
    expect(wrapper.find("a").attributes("href")).toBe("https://pics.example/cat.png");
  });

  it("offers a large image with its size and asks for it on a click", async () => {
    const { wrapper, request } = render("https://pics.example/big.png", async (url, full) =>
      full
        ? { kind: "image", url, image: { mime: "image/png", bytes: 3_000_000, dataUri: DATA } }
        : { kind: "image-pending", url, bytes: 3_000_000 },
    );
    await settle();
    const button = wrapper.get("button");
    expect(button.text()).toMatch(/^Load image \(2[.,]9 MB\)$/);
    await button.trigger("click");
    await settle();
    expect(request).toHaveBeenLastCalledWith("https://pics.example/big.png", true);
    expect(wrapper.find("img").exists()).toBe(true);
    expect(wrapper.find("button").exists()).toBe(false);
  });

  it("offers a large image of unknown size without a number", async () => {
    const { wrapper } = render("https://pics.example/big.png", async (url) => ({ kind: "image-pending", url }));
    await settle();
    expect(wrapper.get("button").text()).toBe("Load image");
  });

  it("says why for a blocked or too large link and stays quiet for the rest", async () => {
    const blocked = render("https://a.example", async () => {
      throw failure("LINK_PREVIEW_BLOCKED");
    });
    await settle();
    expect(blocked.wrapper.text()).toBe("The gateway does not open this address");
    for (const code of ["LINK_PREVIEW_UNSUPPORTED", "LINK_PREVIEW_FAILED", "LINK_PREVIEW_INVALID"]) {
      const quiet = render("https://a.example", async () => {
        throw failure(code);
      });
      await settle();
      expect(quiet.wrapper.text(), code).toBe("");
    }
  });

  it("shows nothing while loading, without links and while previews are off", async () => {
    const loading = render("https://a.example", () => new Promise(() => undefined));
    await settle();
    expect(loading.wrapper.text()).toBe("");
    const none = render("no links here", async () => {
      throw new Error("never asked");
    });
    await settle();
    expect(none.request).not.toHaveBeenCalled();
    const off = render("https://a.example", async (url) => ({ kind: "page", url, siteName: "S", title: "T", description: "" }));
    off.previews.setEnabled(false);
    await settle();
    expect(off.wrapper.text()).toBe("");
  });

  it("asks for at most two links of a message", async () => {
    const { request } = render("https://a.example https://b.example https://c.example", async (url) => ({
      kind: "page",
      url,
      siteName: "S",
      title: "T",
      description: "",
    }));
    await settle();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("draws nothing outside a room that provides previews", () => {
    const wrapper = mount(ChatLinkPreviews, { props: { text: "https://a.example" } });
    expect(wrapper.text()).toBe("");
  });
});

import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ChatMarkdown from "@/features/room/chat/ChatMarkdown.vue";

const render = (text: string) => mount(ChatMarkdown, { props: { text }, attachTo: document.body });

describe("ChatMarkdown", () => {
  it("renders formatting as elements", () => {
    const wrapper = render("**b** *i* ~~s~~ ++u++ `c`");
    expect(wrapper.find("strong").text()).toBe("b");
    expect(wrapper.find("em").text()).toBe("i");
    expect(wrapper.find("s").text()).toBe("s");
    expect(wrapper.find("u").text()).toBe("u");
    expect(wrapper.find("code").text()).toBe("c");
  });

  it("opens links in a new tab without leaking the opener", () => {
    const link = render("[docs](https://example.com)").find("a");
    expect(link.attributes()).toMatchObject({ href: "https://example.com", target: "_blank", rel: "noopener noreferrer" });
  });

  it.each(["[x](javascript:alert(1))", "[x](data:text/html,hi)", "[x](/relative)"])("shows %s as text without a link", (source) => {
    const wrapper = render(source);
    expect(wrapper.find("a").exists()).toBe(false);
    expect(wrapper.text()).toContain("x");
  });

  it.each([
    "<script>window.hacked = 1</script>",
    "<img src=x onerror=alert(1)>",
    '<a href="javascript:alert(1)" onclick="alert(1)">x</a>',
    "<iframe src=//evil.example></iframe>",
  ])("shows %s as text and creates no element for it", (source) => {
    const wrapper = render(source);
    expect(wrapper.find("script, img, iframe, a, [onerror], [onclick]").exists()).toBe(false);
    expect(wrapper.text()).toContain(source.slice(0, 5));
    expect((window as unknown as { hacked?: number }).hacked).toBeUndefined();
  });

  it("keeps line breaks", () => {
    const wrapper = render("one\ntwo\n\nthree");
    expect(wrapper.findAll("p")).toHaveLength(2);
    expect(wrapper.find("p br").exists()).toBe(true);
  });

  it("scrolls wide tables and code inside the bubble", () => {
    const wrapper = render("| A | B |\n|---|---|\n| 1 | 2 |\n\n```\nlong code\n```");
    expect(wrapper.find("table").element.parentElement?.className).toContain("overflow-x-auto");
    expect(wrapper.find("pre").classes()).toContain("overflow-x-auto");
  });

  it("numbers footnotes and lists the definitions", () => {
    const wrapper = render("claim[^a]\n\n[^a]: the source");
    expect(wrapper.find("sup").attributes("aria-label")).toBe("Footnote 1");
    expect(wrapper.text()).toContain("the source");
  });

  it("shows a callout with its title", () => {
    expect(render("> [!WARNING]\n> careful").text()).toContain("Warning");
  });

  it("shows task items as disabled checkboxes with a state for screen readers", () => {
    const boxes = render("- [x] done\n- [ ] open").findAll("[role=checkbox]");
    expect(boxes.map((box) => box.attributes("aria-label"))).toEqual(["Done", "Not done"]);
    expect(boxes.every((box) => box.attributes("disabled") !== undefined)).toBe(true);
  });

  describe("spoiler", () => {
    it("hides the text from assistive technology until it is activated", async () => {
      const wrapper = render("The answer is ||42||.");
      const button = wrapper.find("button");
      expect(button.attributes("aria-label")).toBe("Spoiler, activate to reveal");
      expect(button.find("[aria-hidden=true]").text()).toBe("42");

      await button.trigger("click");
      expect(wrapper.find("button").exists()).toBe(false);
      expect(wrapper.text()).toContain("The answer is 42.");
    });

    it("moves focus onto the revealed text", async () => {
      const wrapper = render("||secret||");
      await wrapper.find("button").trigger("click");
      expect(document.activeElement?.textContent).toBe("secret");
    });

    it("keeps links inside a revealed spoiler working", async () => {
      const wrapper = render("||[go](https://example.com)||");
      expect(wrapper.find("button a").exists()).toBe(true);
      await wrapper.find("button").trigger("click");
      expect(wrapper.find("a").attributes("href")).toBe("https://example.com");
    });
  });

  describe("details", () => {
    it("shows the summary and opens on activation", async () => {
      const wrapper = render(":::details More info\nhidden text\n:::");
      const trigger = wrapper.find("button");
      expect(trigger.text()).toBe("More info");
      expect(trigger.attributes("aria-expanded")).toBe("false");
      await trigger.trigger("click");
      expect(trigger.attributes("aria-expanded")).toBe("true");
      expect(wrapper.text()).toContain("hidden text");
    });

    it("falls back to a default title", () => {
      expect(render(":::details\nbody\n:::").find("button").text()).toBe("Details");
    });
  });
});

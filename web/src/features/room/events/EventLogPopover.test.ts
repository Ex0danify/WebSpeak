import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import EventLogPopover from "@/features/room/events/EventLogPopover.vue";
import type { ServerEvent } from "@/features/session";

const event = (id: string): ServerEvent => ({ id, kind: "joined", message: "x", nickname: "Ana", timestamp: 1 });

function mountPopover(events: ServerEvent[]) {
  return mount(EventLogPopover, {
    props: { events, eventText: (e: ServerEvent) => `${e.nickname} joined`, formatTime: () => "12:00" },
    attachTo: document.body,
  });
}

describe("EventLogPopover", () => {
  it("names the bell by the event log when nothing is new", () => {
    const wrapper = mountPopover([event("a")]);
    expect(wrapper.get("button").attributes("aria-label")).toBe("Event log");
    expect(wrapper.text()).toBe("");
    wrapper.unmount();
  });

  it("counts events that arrive after the room opened and says so in the name", async () => {
    const wrapper = mountPopover([event("a")]);
    await wrapper.setProps({ events: [event("a"), event("b"), event("c")] });
    expect(wrapper.get("button").attributes("aria-label")).toBe("Event log, 2 new");
    expect(wrapper.text()).toBe("2");
    wrapper.unmount();
  });

  it("clears the count once the log is opened", async () => {
    const wrapper = mountPopover([]);
    await wrapper.setProps({ events: [event("a")] });
    expect(wrapper.text()).toBe("1");
    await wrapper.get("button").trigger("click");
    expect(wrapper.get("button").attributes("aria-label")).toBe("Event log");
    expect(document.body.textContent).toContain("Ana joined");
    wrapper.unmount();
  });
});

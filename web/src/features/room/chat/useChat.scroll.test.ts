import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountUseChat } from "@/testSupport/chatFixture";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("stick to the bottom", () => {
  // happy-dom does no layout, so the geometry is set by hand.
  function fakeList(geometry: { scrollHeight: number; scrollTop: number; clientHeight: number }) {
    const list = document.createElement("div");
    Object.defineProperties(list, {
      scrollHeight: { value: geometry.scrollHeight, configurable: true },
      clientHeight: { value: geometry.clientHeight, configurable: true },
      scrollTop: { value: geometry.scrollTop, writable: true, configurable: true },
    });
    list.scrollTo = vi.fn() as unknown as typeof list.scrollTo;
    return list;
  }

  it("starts at the bottom", async () => {
    const { vm } = await mountUseChat();
    expect(vm.atBottom).toBe(true);
  });

  it("leaves the bottom when the reader scrolls up and returns when they scroll back", async () => {
    const { vm } = await mountUseChat();
    const list = fakeList({ scrollHeight: 1000, scrollTop: 100, clientHeight: 400 });
    vm.setChatListElement(list);
    list.dispatchEvent(new Event("scroll"));
    expect(vm.atBottom).toBe(false);
    list.scrollTop = 580;
    list.dispatchEvent(new Event("scroll"));
    expect(vm.atBottom).toBe(true);
  });

  it("does not drag a reader who scrolled up down for someone else's message", async () => {
    const { vm, chatMessages } = await mountUseChat();
    const list = fakeList({ scrollHeight: 1000, scrollTop: 0, clientHeight: 400 });
    vm.setChatListElement(list);
    list.dispatchEvent(new Event("scroll"));
    chatMessages.push({ id: "1", scope: "channel", invokerName: "Ana", message: "hi", timestamp: 1 });
    await flushPromises();
    expect(list.scrollTo).not.toHaveBeenCalled();
    expect(vm.atBottom).toBe(false);
  });

  it("brings the reader back to the end for their own message", async () => {
    const { vm, chatMessages } = await mountUseChat();
    const list = fakeList({ scrollHeight: 1000, scrollTop: 0, clientHeight: 400 });
    vm.setChatListElement(list);
    list.dispatchEvent(new Event("scroll"));
    chatMessages.push({ id: "1", scope: "channel", invokerName: "Lucas", message: "hi", timestamp: 1, isSelf: true });
    await flushPromises();
    expect(list.scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: "smooth" });
    expect(vm.atBottom).toBe(true);
  });

  it("jumping to the latest hides the prompt at once", async () => {
    const { vm } = await mountUseChat();
    const list = fakeList({ scrollHeight: 1000, scrollTop: 0, clientHeight: 400 });
    vm.setChatListElement(list);
    list.dispatchEvent(new Event("scroll"));
    vm.scrollChatToEnd();
    expect(vm.atBottom).toBe(true);
  });
});

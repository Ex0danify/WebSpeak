import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useJoinFormStore } from "@/features/join/stores/joinFormStore";
import { useShareInvite } from "@/features/join/useShareInvite";

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("doShare", () => {
  it("copies an invite link built from the current target and channel", async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const store = useJoinFormStore();
    store.accessMode = "open";
    store.serverHost = "voice.example.com";
    store.serverPort = "9987";
    store.channel = "lobby";
    const wrapper = mount(defineComponent({ setup: () => useShareInvite(), template: "<div/>" }));
    (wrapper.vm as unknown as { doShare: () => void }).doShare();
    await flushPromises();
    expect(writeText).toHaveBeenCalled();
    const invite = writeText.mock.calls[0][0] as string;
    expect(invite).toContain("channel=lobby");
    expect(invite).toContain("server=voice.example.com");
  });
});

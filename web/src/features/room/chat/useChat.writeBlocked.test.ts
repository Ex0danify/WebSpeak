import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, reactive, ref, type Ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { ChannelMember, ChatMessage, ServerEvent, VoiceState } from "@/features/session";
import type { ChatTab } from "@/features/room/roomTypes";
import { useChat } from "@/features/room/chat/useChat";

type Tab = ChatTab;

async function mountChat(allowed: { channel?: Ref<boolean>; server?: Ref<boolean> } = {}) {
  const chatTab = ref<Tab>("channel");
  const sent = { channel: vi.fn(), server: vi.fn() };
  const wrapper = mount(
    defineComponent({
      setup: () =>
        useChat({
          session: { state: reactive({ tsClientId: 1 }) as VoiceState },
          roster: { members: reactive<ChannelMember[]>([]), serverEvents: reactive<ServerEvent[]>([]) },
          chat: {
            chatMessages: reactive<ChatMessage[]>([]),
            sendTextMessage: sent.channel,
            sendServerMessage: sent.server,
            sendPrivateMessage: vi.fn(),
            canWriteChannel: allowed.channel ?? ref(true),
            canWriteServer: allowed.server ?? ref(true),
          },
          currentChannel: ref(undefined),
          currentChannelName: ref("Lobby"),
          selectedChannelId: ref("1"),
          chatTab,
          memberMenu: ref(null),
          isMobileViewport: ref(false),
          mobileSection: ref("channels"),
        }),
      template: "<div/>",
    }),
  );
  await flushPromises();
  return { vm: wrapper.vm as unknown as { writeBlockedHint: string; messageDraft: string; submitMessage: () => void }, chatTab, sent };
}

describe("writeBlockedHint", () => {
  it("is empty while writing is allowed", async () => {
    const { vm, chatTab } = await mountChat();
    expect(vm.writeBlockedHint).toBe("");
    chatTab.value = "server";
    expect(vm.writeBlockedHint).toBe("");
  });

  it("explains a channel the server does not let us write to, and keeps the draft", async () => {
    const { vm, sent } = await mountChat({ channel: ref(false) });
    expect(vm.writeBlockedHint).toMatch(/channel/i);
    vm.messageDraft = "hello";
    vm.submitMessage();
    expect(sent.channel).not.toHaveBeenCalled();
    expect(vm.messageDraft).toBe("hello");
  });

  it("blocks only the tab it belongs to", async () => {
    const { vm, chatTab, sent } = await mountChat({ server: ref(false) });
    expect(vm.writeBlockedHint).toBe("");
    chatTab.value = "server";
    expect(vm.writeBlockedHint).toMatch(/server/i);
    vm.messageDraft = "hello";
    vm.submitMessage();
    expect(sent.server).not.toHaveBeenCalled();
  });

  it("never blocks a private chat, the server answers a refusal there", async () => {
    const { vm, chatTab } = await mountChat({ channel: ref(false), server: ref(false) });
    chatTab.value = "private";
    expect(vm.writeBlockedHint).toBe("");
  });

  it("lifts as soon as the permission comes back", async () => {
    const channel = ref(false);
    const { vm } = await mountChat({ channel });
    expect(vm.writeBlockedHint).not.toBe("");
    channel.value = true;
    expect(vm.writeBlockedHint).toBe("");
  });
});

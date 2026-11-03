import { flushPromises } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/features/session";
import { mountUseChat } from "@/testSupport/chatFixture";

type Tabs = { unreadTabs: Set<string>; closePrivateChat: (id: string) => void; privateConversations: { id: string }[] };

const message = (extra: Partial<ChatMessage> & Pick<ChatMessage, "id" | "scope">): ChatMessage => ({
  invokerName: "Ana",
  message: "hi",
  timestamp: 1,
  ...extra,
});

describe("unread tabs", () => {
  it("marks a tab that gets a message while another one is open, and clears it when that tab is opened", async () => {
    const { vm, options, chatMessages } = await mountUseChat();
    const tabs = vm as unknown as Tabs;
    chatMessages.push(message({ id: "1", scope: "server" }));
    await flushPromises();
    expect([...tabs.unreadTabs]).toEqual(["server"]);

    options.chatTab.value = "server";
    await flushPromises();
    expect(tabs.unreadTabs.size).toBe(0);
  });

  it("never marks the tab that is open", async () => {
    const { vm, chatMessages } = await mountUseChat();
    chatMessages.push(message({ id: "1", scope: "channel" }));
    await flushPromises();
    expect((vm as unknown as Tabs).unreadTabs.size).toBe(0);
  });

  it("ignores your own messages", async () => {
    const { vm, chatMessages } = await mountUseChat();
    chatMessages.push(message({ id: "1", scope: "server", isSelf: true }));
    await flushPromises();
    expect((vm as unknown as Tabs).unreadTabs.size).toBe(0);
  });

  it("marks a private chat by its own tab key", async () => {
    const { vm, chatMessages } = await mountUseChat();
    chatMessages.push(message({ id: "1", scope: "private", conversationId: "id:2" }));
    await flushPromises();
    expect([...(vm as unknown as Tabs).unreadTabs]).toEqual(["private-id:2"]);
  });

  it("does not count the open tab as read while the chat is not on screen on a phone", async () => {
    const { vm, options, chatMessages } = await mountUseChat();
    options.isMobileViewport.value = true;
    options.mobileSection.value = "voice";
    chatMessages.push(message({ id: "1", scope: "channel" }));
    await flushPromises();
    expect([...(vm as unknown as Tabs).unreadTabs]).toEqual(["channel"]);

    options.mobileSection.value = "chat";
    await flushPromises();
    expect((vm as unknown as Tabs).unreadTabs.size).toBe(0);
  });
});

describe("closing a private chat", () => {
  it("takes it off the tab bar and leaves the open chat for the channel", async () => {
    const { vm, options, chatMessages } = await mountUseChat();
    const tabs = vm as unknown as Tabs;
    chatMessages.push(message({ id: "1", scope: "private", conversationId: "id:2", timestamp: 10 }));
    vm.openPrivateChat("id:2");
    await flushPromises();
    expect(options.chatTab.value).toBe("private");

    tabs.closePrivateChat("id:2");
    await flushPromises();
    expect(tabs.privateConversations).toEqual([]);
    expect(options.chatTab.value).toBe("channel");
    expect(vm.privateConversationId).toBe("");
  });

  it("brings the chat back with the next message from the other person", async () => {
    const { vm, chatMessages } = await mountUseChat();
    const tabs = vm as unknown as Tabs;
    chatMessages.push(message({ id: "1", scope: "private", conversationId: "id:2", timestamp: 10 }));
    await flushPromises();
    tabs.closePrivateChat("id:2");
    await flushPromises();
    expect(tabs.privateConversations).toEqual([]);

    chatMessages.push(message({ id: "2", scope: "private", conversationId: "id:2", timestamp: 20 }));
    await flushPromises();
    expect(tabs.privateConversations.map((conversation) => conversation.id)).toEqual(["id:2"]);
  });

  it("opens a closed chat again from the member menu", async () => {
    const { vm, chatMessages } = await mountUseChat();
    const tabs = vm as unknown as Tabs;
    chatMessages.push(message({ id: "1", scope: "private", conversationId: "id:2", timestamp: 10 }));
    await flushPromises();
    tabs.closePrivateChat("id:2");
    vm.openPrivateChat(2);
    await flushPromises();
    expect(tabs.privateConversations.map((conversation) => conversation.id)).toEqual(["id:2"]);
  });
});

import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, reactive, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChannelMember, ChatMessage, ServerEvent, VoiceState } from "@/features/session";
import type { TreeChannel } from "../roomTypes";

type Exposed = {
  messageDraft: string;
  privateClientId: number;
  chatListEl: HTMLElement | null;
  privateConversations: Array<{ id: number; name: string; lastMessage: number }>;
  visibleChatMessages: ChatMessage[];
  chatTabLabel: string;
  chatPanelId: string;
  chatTabId: (key: string) => string;
  activeChatTabId: string;
  chatTitle: string;
  chatPlaceholder: string;
  formatTime: (timestamp: number) => string;
  submitMessage: () => void;
  openPrivateChat: (clientId: number) => void;
  scrollChatToEnd: () => void;
  setChatListElement: (element: unknown) => void;
  eventText: (event: ServerEvent) => string;
};

function member(id: number, nickname: string): ChannelMember {
  return { id, nickname };
}

function makeVoiceState(overrides: Partial<VoiceState> = {}): VoiceState {
  return reactive({
    connected: true, connecting: false, reconnecting: false, reconnectAttempt: 0, reconnectFailed: false,
    tsClientId: 1, error: "", errorCode: "", microphoneError: "", microphoneErrorCode: "", audioNotice: "",
    audioNoticeCode: "", channelSwitchedChannelId: "",
    ...overrides,
  }) as VoiceState;
}

function channel(id: string, name: string): TreeChannel {
  return { id, parentID: "0", name, depth: 0, members: [] };
}

async function mountUseChat(overrides: Record<string, unknown> = {}) {
  const { useChat } = await import("./useChat");
  const voiceState = makeVoiceState();
  const members = reactive<ChannelMember[]>([member(1, "Lucas"), member(2, "Ana")]);
  const chatMessages = reactive<ChatMessage[]>([]);
  const options = {
    voiceState,
    members,
    chatMessages,
    currentChannel: ref<TreeChannel | undefined>(channel("lobby", "Lobby")),
    currentChannelName: ref("Lobby"),
    selectedChannelId: ref(""),
    chatTab: ref<"channel" | "server" | "private" | "events">("channel"),
    memberMenu: ref<{ member: ChannelMember; x: number; y: number } | null>(null),
    isMobileViewport: ref(false),
    mobileSection: ref<"channels" | "chat" | "voice" | "more">("channels"),
    sendTextMessage: vi.fn(),
    sendServerMessage: vi.fn(),
    sendPrivateMessage: vi.fn(),
    ...overrides,
  };
  const wrapper = mount(defineComponent({ setup: () => useChat({
    ...options,
    session: { state: options.voiceState },
    roster: { members: options.members },
    chat: options,
  }), template: "<div/>" }));
  await flushPromises();
  return { wrapper, vm: wrapper.vm as unknown as Exposed, options, voiceState, members, chatMessages };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("privateConversations", () => {
  it("groups private messages by conversation, keeping the latest name and timestamp", async () => {
    const { vm, chatMessages } = await mountUseChat();
    chatMessages.push(
      { id: "1", scope: "private", conversationId: "2", invokerName: "Ana", message: "hi", timestamp: 10 },
      { id: "2", scope: "private", conversationId: "2", invokerName: "Ana", message: "yo", timestamp: 20 },
    );
    await flushPromises();
    expect(vm.privateConversations).toEqual([{ id: 2, name: "Ana", lastMessage: 20 }]);
  });

  it("lists a just-opened conversation with no message yet under the member's name (F25)", async () => {
    const { vm } = await mountUseChat();
    vm.openPrivateChat(2);
    await flushPromises();
    expect(vm.privateConversations).toEqual([{ id: 2, name: "Ana", lastMessage: 0 }]);
  });

  it("orders conversations by most recent message first", async () => {
    const { vm, chatMessages, members } = await mountUseChat();
    members.push(member(3, "Ben"));
    chatMessages.push(
      { id: "1", scope: "private", conversationId: "2", invokerName: "Ana", message: "hi", timestamp: 10 },
      { id: "2", scope: "private", conversationId: "3", invokerName: "Ben", message: "hey", timestamp: 50 },
    );
    await flushPromises();
    expect(vm.privateConversations.map((c) => c.id)).toEqual([3, 2]);
  });
});

describe("visibleChatMessages", () => {
  it("filters channel messages to the current channel (or untargeted ones)", async () => {
    const { vm, chatMessages } = await mountUseChat();
    chatMessages.push(
      { id: "1", scope: "channel", targetId: "lobby", invokerName: "Ana", message: "in lobby", timestamp: 1 },
      { id: "2", scope: "channel", targetId: "raid", invokerName: "Ana", message: "in raid", timestamp: 2 },
      { id: "3", scope: "channel", invokerName: "Ana", message: "untargeted", timestamp: 3 },
      { id: "4", scope: "server", invokerName: "Ana", message: "server", timestamp: 4 },
    );
    await flushPromises();
    expect(vm.visibleChatMessages.map((m) => m.id)).toEqual(["1", "3"]);
  });

  it("filters to server messages on the server tab", async () => {
    const { vm, options, chatMessages } = await mountUseChat();
    options.chatTab.value = "server";
    chatMessages.push(
      { id: "1", scope: "channel", invokerName: "Ana", message: "channel", timestamp: 1 },
      { id: "2", scope: "server", invokerName: "Ana", message: "server", timestamp: 2 },
    );
    await flushPromises();
    expect(vm.visibleChatMessages.map((m) => m.id)).toEqual(["2"]);
  });

  it("filters to the active private conversation on the private tab", async () => {
    const { vm, options, chatMessages } = await mountUseChat();
    options.chatTab.value = "private";
    vm.privateClientId = 2;
    chatMessages.push(
      { id: "1", scope: "private", conversationId: "2", invokerName: "Ana", message: "for 2", timestamp: 1 },
      { id: "2", scope: "private", conversationId: "3", invokerName: "Ben", message: "for 3", timestamp: 2 },
    );
    await flushPromises();
    expect(vm.visibleChatMessages.map((m) => m.id)).toEqual(["1"]);
  });

  it("shows nothing on the events tab", async () => {
    const { vm, options, chatMessages } = await mountUseChat();
    options.chatTab.value = "events";
    chatMessages.push({ id: "1", scope: "channel", invokerName: "Ana", message: "channel", timestamp: 1 });
    await flushPromises();
    expect(vm.visibleChatMessages).toEqual([]);
  });
});

describe("chat tab labels and ids", () => {
  it("derives chatPanelId, chatTabId and activeChatTabId", async () => {
    const { vm } = await mountUseChat();
    expect(vm.chatPanelId).toBe("chat-tabpanel");
    expect(vm.chatTabId("server")).toBe("chat-tab-server");
    expect(vm.activeChatTabId).toBe("chat-tab-channel");
  });

  it("switches activeChatTabId to the private conversation once one is open", async () => {
    const { vm } = await mountUseChat();
    vm.openPrivateChat(2);
    await flushPromises();
    expect(vm.activeChatTabId).toBe("chat-tab-private-2");
  });

  it("chatTitle falls back to the private-message label when the conversation isn't known yet", async () => {
    const { vm, options } = await mountUseChat();
    options.chatTab.value = "private";
    await flushPromises();
    expect(vm.chatTitle.length).toBeGreaterThan(0);
  });
});

describe("formatTime", () => {
  it("formats a timestamp as a time string", async () => {
    const { vm } = await mountUseChat();
    expect(vm.formatTime(0)).toMatch(/\d/);
  });
});

describe("submitMessage", () => {
  it("does nothing for a blank draft", async () => {
    const { vm, options } = await mountUseChat();
    vm.messageDraft = "   ";
    vm.submitMessage();
    expect(options.sendTextMessage).not.toHaveBeenCalled();
  });

  it("sends a channel message using the current channel id and clears the draft", async () => {
    const { vm, options } = await mountUseChat();
    vm.messageDraft = "hello";
    vm.submitMessage();
    expect(options.sendTextMessage).toHaveBeenCalledWith("hello", "lobby");
    expect(vm.messageDraft).toBe("");
  });

  it("falls back to selectedChannelId when there is no current channel", async () => {
    const { vm, options } = await mountUseChat({ currentChannel: ref(undefined), selectedChannelId: ref("fallback") });
    vm.messageDraft = "hello";
    vm.submitMessage();
    expect(options.sendTextMessage).toHaveBeenCalledWith("hello", "fallback");
  });

  it("sends a server message on the server tab", async () => {
    const { vm, options } = await mountUseChat();
    options.chatTab.value = "server";
    vm.messageDraft = "hello server";
    vm.submitMessage();
    expect(options.sendServerMessage).toHaveBeenCalledWith("hello server");
  });

  it("sends a private message on the private tab", async () => {
    const { vm, options } = await mountUseChat();
    options.chatTab.value = "private";
    vm.privateClientId = 2;
    vm.messageDraft = "hi Ana";
    vm.submitMessage();
    expect(options.sendPrivateMessage).toHaveBeenCalledWith(2, "hi Ana", "2");
  });
});

describe("openPrivateChat", () => {
  it("ignores an empty or self client id", async () => {
    const { vm, options } = await mountUseChat();
    vm.openPrivateChat(0);
    vm.openPrivateChat(options.voiceState.tsClientId);
    expect(vm.privateClientId).toBe(0);
  });

  it("opens the conversation, switches to the private tab and closes the member menu", async () => {
    const { vm, options } = await mountUseChat();
    options.memberMenu.value = { member: member(2, "Ana"), x: 0, y: 0 };
    vm.openPrivateChat(2);
    expect(vm.privateClientId).toBe(2);
    expect(options.chatTab.value).toBe("private");
    expect(options.memberMenu.value).toBeNull();
  });

  it("switches the mobile section to chat when viewed on mobile", async () => {
    const { vm, options } = await mountUseChat({ isMobileViewport: ref(true) });
    vm.openPrivateChat(2);
    expect(options.mobileSection.value).toBe("chat");
  });
});

describe("scrollChatToEnd", () => {
  it("scrolls the chat list to the bottom when it exists", async () => {
    const { vm } = await mountUseChat();
    const scrollTo = vi.fn();
    vm.chatListEl = { scrollTo, scrollHeight: 500 } as unknown as HTMLElement;
    vm.scrollChatToEnd();
    expect(scrollTo).toHaveBeenCalledWith({ top: 500, behavior: "smooth" });
  });

  it("does nothing when the chat list isn't mounted", async () => {
    const { vm } = await mountUseChat();
    expect(() => vm.scrollChatToEnd()).not.toThrow();
  });

  it("scrolls to the end whenever a new message, tab switch or conversation change happens", async () => {
    const { vm, options, chatMessages } = await mountUseChat();
    const scrollTo = vi.fn();
    vm.chatListEl = { scrollTo, scrollHeight: 100 } as unknown as HTMLElement;
    chatMessages.push({ id: "1", scope: "channel", invokerName: "Ana", message: "hi", timestamp: 1 });
    await flushPromises();
    expect(scrollTo).toHaveBeenCalled();

    scrollTo.mockClear();
    options.chatTab.value = "server";
    await flushPromises();
    expect(scrollTo).toHaveBeenCalled();
  });
});

describe("setChatListElement", () => {
  it("accepts any HTML element", async () => {
    const { vm } = await mountUseChat();
    const list = document.createElement("div");
    vm.setChatListElement(list);
    expect(vm.chatListEl).toBe(list);
  });

  it("ignores a non-element value", async () => {
    const { vm } = await mountUseChat();
    vm.setChatListElement({});
    expect(vm.chatListEl).toBeNull();
  });
});

describe("eventText", () => {
  it("returns the raw message when the gateway sends neither nickname nor channelName", async () => {
    const { vm } = await mountUseChat();
    expect(vm.eventText({ id: "1", kind: "joined", message: "原始消息", timestamp: 0 })).toBe("原始消息");
  });

  it("builds a translated sentence when the gateway sends a nickname", async () => {
    const { vm } = await mountUseChat();
    expect(vm.eventText({ id: "1", kind: "joined", message: "fallback", nickname: "Ana", timestamp: 0 })).toContain("Ana");
  });

  it("builds a translated sentence for a channel event when channelName is sent", async () => {
    const { vm } = await mountUseChat();
    expect(vm.eventText({ id: "1", kind: "channelCreated", message: "fallback", channelName: "Raid", timestamp: 0 })).toContain("Raid");
  });

  it("falls back to the raw message for an unknown event kind", async () => {
    const { vm } = await mountUseChat();
    expect(vm.eventText({ id: "1", kind: "unknown", message: "whatever", timestamp: 0 })).toBe("whatever");
  });
});

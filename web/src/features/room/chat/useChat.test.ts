import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, reactive, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChannelMember, ChatMessage, ServerEvent, VoiceState } from "@/features/session";
import type { TreeChannel } from "../roomTypes";

type Exposed = {
  messageDraft: string;
  privateConversationId: string;
  privatePeerName: string;
  chatListEl: HTMLElement | null;
  privateConversations: Array<{ id: string; name: string; lastMessage: number }>;
  visibleChatMessages: ChatMessage[];
  chatTabLabel: string;
  chatTitle: string;
  chatPlaceholder: string;
  formatTime: (timestamp: number) => string;
  submitMessage: () => void;
  openPrivateChat: (target: number | string) => void;
  scrollChatToEnd: () => void;
  setChatListElement: (element: unknown) => void;
  eventText: (event: ServerEvent) => string;
};

function member(id: number, nickname: string): ChannelMember {
  return { id, nickname };
}

function makeVoiceState(overrides: Partial<VoiceState> = {}): VoiceState {
  return reactive({
    connected: true,
    connecting: false,
    reconnecting: false,
    reconnectAttempt: 0,
    reconnectFailed: false,
    tsClientId: 1,
    error: "",
    errorCode: "",
    microphoneError: "",
    microphoneErrorCode: "",
    audioNotice: "",
    audioNoticeCode: "",
    channelSwitchedChannelId: "",
    ...overrides,
  }) as VoiceState;
}

function channel(id: string, name: string): TreeChannel {
  return { id, parentID: "0", name, depth: 0, members: [], rootId: id, isLastChild: true, ancestorLines: [] };
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
  const wrapper = mount(
    defineComponent({
      setup: () =>
        useChat({
          ...options,
          session: { state: options.voiceState },
          roster: { members: options.members },
          chat: options,
        }),
      template: "<div/>",
    }),
  );
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
      { id: "1", scope: "private", conversationId: "id:2", invokerName: "Ana", message: "hi", timestamp: 10 },
      { id: "2", scope: "private", conversationId: "id:2", invokerName: "Ana", message: "yo", timestamp: 20 },
    );
    await flushPromises();
    expect(vm.privateConversations).toEqual([{ id: "id:2", name: "Ana", lastMessage: 20 }]);
  });

  it("lists a just-opened conversation with no message yet under the member's name", async () => {
    const { vm } = await mountUseChat();
    vm.openPrivateChat(2);
    await flushPromises();
    expect(vm.privateConversations).toEqual([{ id: "id:2", name: "Ana", lastMessage: 0 }]);
  });

  it("orders conversations by most recent message first", async () => {
    const { vm, chatMessages, members } = await mountUseChat();
    members.push(member(3, "Ben"));
    chatMessages.push(
      { id: "1", scope: "private", conversationId: "id:2", invokerName: "Ana", message: "hi", timestamp: 10 },
      { id: "2", scope: "private", conversationId: "id:3", invokerName: "Ben", message: "hey", timestamp: 50 },
    );
    await flushPromises();
    expect(vm.privateConversations.map((c) => c.id)).toEqual(["id:3", "id:2"]);
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
    vm.privateConversationId = "id:2";
    chatMessages.push(
      { id: "1", scope: "private", conversationId: "id:2", invokerName: "Ana", message: "for 2", timestamp: 1 },
      { id: "2", scope: "private", conversationId: "id:3", invokerName: "Ben", message: "for 3", timestamp: 2 },
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

describe("chat tab labels", () => {
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
    vm.privateConversationId = "id:2";
    vm.messageDraft = "hi Ana";
    vm.submitMessage();
    expect(options.sendPrivateMessage).toHaveBeenCalledWith(2, "hi Ana", "2");
  });
});

describe("private conversations keyed by uid", () => {
  it("do not follow a client id that TeamSpeak hands to someone else", async () => {
    const { vm, options, members, chatMessages } = await mountUseChat();
    members.splice(0, members.length, member(1, "Lucas"), { id: 2, nickname: "Ana", uid: "uid-ana" });
    chatMessages.push({ id: "1", scope: "private", conversationId: "uid:uid-ana", invokerName: "Ana", message: "hi", timestamp: 10 });
    members.splice(1, 1, { id: 2, nickname: "Ben", uid: "uid-ben" });
    vm.openPrivateChat(2);
    await flushPromises();
    expect(vm.privateConversations.map((c) => [c.id, c.name])).toEqual([
      ["uid:uid-ana", "Ana"],
      ["uid:uid-ben", "Ben"],
    ]);
    expect(vm.visibleChatMessages).toEqual([]);
    vm.openPrivateChat("uid:uid-ana");
    await flushPromises();
    expect(vm.privatePeerName).toBe("Ana");
    expect(vm.visibleChatMessages).toHaveLength(1);
    vm.messageDraft = "still there?";
    vm.submitMessage();
    expect(options.sendPrivateMessage).not.toHaveBeenCalled();
    expect(vm.messageDraft).toBe("still there?");
    members.push({ id: 7, nickname: "Ana", uid: "uid-ana" });
    await flushPromises();
    expect(vm.privatePeerName).toBe("");
    vm.submitMessage();
    expect(options.sendPrivateMessage).toHaveBeenCalledWith(7, "still there?", "7");
  });
});

describe("the name of a private chat whose person has left", () => {
  it("is the name your message was addressed to, never your own", async () => {
    const { vm, members, chatMessages } = await mountUseChat();
    members.splice(0, members.length, member(1, "Lucas"));
    chatMessages.push({
      id: "1",
      scope: "private",
      conversationId: "uid:uid-ana",
      invokerName: "Lucas",
      peerName: "Ana",
      isSelf: true,
      message: "hi",
      timestamp: 10,
    });
    await flushPromises();
    expect(vm.privateConversations).toEqual([{ id: "uid:uid-ana", name: "Ana", lastMessage: 10 }]);
    chatMessages[0] = { ...chatMessages[0]!, peerName: undefined };
    await flushPromises();
    expect(vm.privateConversations[0]?.name).not.toBe("Lucas");
  });
});

describe("openPrivateChat", () => {
  it("ignores an empty or self client id", async () => {
    const { vm, options } = await mountUseChat();
    vm.openPrivateChat(0);
    vm.openPrivateChat(options.voiceState.tsClientId);
    expect(vm.privateConversationId).toBe("");
  });

  it("opens the conversation, switches to the private tab and closes the member menu", async () => {
    const { vm, options } = await mountUseChat();
    options.memberMenu.value = { member: member(2, "Ana"), x: 0, y: 0 };
    vm.openPrivateChat(2);
    expect(vm.privateConversationId).toBe("id:2");
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
  it("renders a nameless client and an unnamed channel from keys, not from the English message", async () => {
    const { vm } = await mountUseChat();
    expect(vm.eventText({ id: "1", kind: "joined", message: "Unknown user joined the server", timestamp: 0 })).toBe(
      "Unnamed user joined the server",
    );
    expect(vm.eventText({ id: "2", kind: "channelDeleted", message: "x", channelName: "", timestamp: 0 })).toBe(
      'Channel "Unnamed channel" was deleted',
    );
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

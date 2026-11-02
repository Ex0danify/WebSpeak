import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, reactive, ref } from "vue";
import { vi } from "vitest";
import type { ChannelMember, ChatMessage, ServerEvent, VoiceState } from "@/features/session";
import type { ChatTab, TreeChannel } from "@/features/room/roomTypes";

export type Exposed = {
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
  atBottom: boolean;
  setChatListElement: (element: unknown) => void;
  eventText: (event: ServerEvent) => string;
};

export function member(id: number, nickname: string): ChannelMember {
  return { id, nickname };
}

export function makeVoiceState(overrides: Partial<VoiceState> = {}): VoiceState {
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
    unattributedError: null,
    channelSwitchedChannelId: "",
    ...overrides,
  }) as VoiceState;
}

export function channel(id: string, name: string): TreeChannel {
  return { id, parentID: "0", name, depth: 0, members: [], rootId: id, isLastChild: true, ancestorLines: [] };
}

export async function mountUseChat(overrides: Record<string, unknown> = {}) {
  const { useChat } = await import("@/features/room/chat/useChat");
  const voiceState = makeVoiceState();
  const members = reactive<ChannelMember[]>([member(1, "Lucas"), member(2, "Ana")]);
  const chatMessages = reactive<ChatMessage[]>([]);
  const serverEvents = reactive<ServerEvent[]>([]);
  const options = {
    voiceState,
    members,
    chatMessages,
    serverEvents,
    currentChannel: ref<TreeChannel | undefined>(channel("lobby", "Lobby")),
    currentChannelName: ref("Lobby"),
    selectedChannelId: ref(""),
    chatTab: ref<ChatTab>("channel"),
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
          roster: { members: options.members, serverEvents: options.serverEvents },
          chat: options,
        }),
      template: "<div/>",
    }),
  );
  await flushPromises();
  return { wrapper, vm: wrapper.vm as unknown as Exposed, options, voiceState, members, chatMessages, serverEvents };
}

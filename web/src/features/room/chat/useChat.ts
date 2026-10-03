import { computed, nextTick, ref, watch, type Ref } from "vue";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { formatTime as formatTimestamp } from "@/shared/lib/format.js";
import type { TreeChannel } from "../roomTypes.js";
import type { ChannelMember, ServerEvent } from "@/features/session";
import type { RoomSession } from "../roomTypes.js";

export interface UseChatOptions {
  session: Pick<RoomSession["session"], "state">;
  roster: Pick<RoomSession["roster"], "members">;
  chat: Pick<RoomSession["chat"], "chatMessages" | "sendTextMessage" | "sendServerMessage" | "sendPrivateMessage">;
  /** Owned by useChannelTree. */
  currentChannel: Ref<TreeChannel | undefined>;
  currentChannelName: Ref<string>;
  selectedChannelId: Ref<string>;
  /** Owned by RoomView: also passed to useChannelTree, whose selectChannel() sets it back to
   *  "channel", so it can't be created here without a circular dependency between the two composables. */
  chatTab: Ref<"channel" | "server" | "private" | "events">;
  /** Owned by useMemberMenu: closed when a private chat is opened from the member menu. */
  memberMenu: Ref<{ member: ChannelMember; x: number; y: number } | null>;
  /** Owned by useRoomShell. */
  isMobileViewport: Ref<boolean>;
  mobileSection: Ref<"channels" | "chat" | "voice" | "more">;
}

/** The chat panel: channel/server/private/events tabs, the message composer, private-conversation
 *  derivation, the event log's own sentence-building, and the scroll-to-end behavior. */
export function useChat(options: UseChatOptions) {
  const { currentChannel, currentChannelName, selectedChannelId, chatTab, memberMenu, isMobileViewport, mobileSection } = options;
  const { state: voiceState } = options.session;
  const { members } = options.roster;
  const { chatMessages, sendTextMessage, sendServerMessage, sendPrivateMessage } = options.chat;
  const { language, t } = useI18n();

  const messageDraft = ref("");
  const privateClientId = ref(0);
  const chatListEl = ref<HTMLElement | null>(null);

  function formatTime(timestamp: number) {
    return formatTimestamp(timestamp, language.value);
  }

  const privateConversations = computed(() => {
    const conversations = new Map<string, { id: number; name: string; lastMessage: number }>();
    for (const message of chatMessages) {
      if (message.scope !== "private" || !message.conversationId) continue;
      const id = Number(message.conversationId);
      if (!id) continue;
      const member = members.find((candidate) => candidate.id === id);
      const existing = conversations.get(message.conversationId);
      conversations.set(message.conversationId, { id, name: member?.nickname ?? existing?.name ?? message.invokerName, lastMessage: Math.max(existing?.lastMessage ?? 0, message.timestamp) });
    }
    // The chat just opened from the member menu has no message yet: list it under the member's name (F25).
    if (privateClientId.value && !conversations.has(String(privateClientId.value))) {
      const member = members.find((candidate) => candidate.id === privateClientId.value);
      if (member) conversations.set(String(privateClientId.value), { id: privateClientId.value, name: member.nickname, lastMessage: 0 });
    }
    return [...conversations.values()].sort((a, b) => b.lastMessage - a.lastMessage);
  });

  const visibleChatMessages = computed(() => {
    if (chatTab.value === "server") return chatMessages.filter((message) => message.scope === "server");
    if (chatTab.value === "private") return chatMessages.filter((message) => message.scope === "private" && message.conversationId === String(privateClientId.value));
    if (chatTab.value !== "channel") return [];
    const channelId = currentChannel.value?.id;
    return chatMessages.filter((message) => message.scope === "channel" && (!message.targetId || message.targetId === "0" || !channelId || message.targetId === channelId));
  });

  const chatTabLabel = computed(() => chatTab.value === "channel" ? t("textChannel") : chatTab.value === "server" ? t("serverChat") : chatTab.value === "private" ? t("privateMessage") : t("eventLog"));
  const chatPanelId = "chat-tabpanel";
  const chatTabId = (key: string) => `chat-tab-${key}`;
  const activeChatTabId = computed(() => chatTabId(chatTab.value === "private" ? `private-${privateClientId.value}` : chatTab.value));
  const chatTitle = computed(() => chatTab.value === "channel" ? t("channelChat", { channel: currentChannelName.value }) : chatTab.value === "server" ? t("serverChat") : chatTab.value === "events" ? t("eventLog") : privateConversations.value.find((conversation) => conversation.id === privateClientId.value)?.name ?? t("privateMessage"));
  const chatPlaceholder = computed(() => chatTab.value === "private" ? t("privateMessagePlaceholder") : chatTab.value === "server" ? t("serverMessagePlaceholder") : t("sendMessagePlaceholder"));

  function scrollChatToEnd() {
    const list = chatListEl.value;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }

  function setChatListElement(element: unknown): void {
    chatListEl.value = element instanceof HTMLElement ? element : null;
  }

  watch([() => chatMessages.length, chatTab, privateClientId], () => nextTick(scrollChatToEnd));

  function submitMessage() {
    if (!messageDraft.value.trim()) return;
    if (chatTab.value === "channel") sendTextMessage(messageDraft.value, currentChannel.value?.id ?? selectedChannelId.value);
    else if (chatTab.value === "server") sendServerMessage(messageDraft.value);
    else if (chatTab.value === "private" && privateClientId.value) sendPrivateMessage(privateClientId.value, messageDraft.value, String(privateClientId.value));
    messageDraft.value = "";
  }

  function openPrivateChat(clientId: number): void {
    if (!clientId || clientId === voiceState.tsClientId) return;
    privateClientId.value = clientId;
    chatTab.value = "private";
    if (isMobileViewport.value) mobileSection.value = "chat";
    memberMenu.value = null;
    nextTick(scrollChatToEnd);
  }

  // F24: the gateway used to write the event log itself, in Chinese, and the client showed `message`
  // as it is. A gateway that sends `nickname` or `channelName` lets the sentence be built here with
  // t() instead, in the page's own language; an older gateway sends neither, and `message` is shown
  // unchanged (English and German among the entries showed no bug of their own before this).
  function eventText(event: ServerEvent): string {
    switch (event.kind) {
      case "connection": return t("eventConnected");
      case "joined": return event.nickname ? t("eventMemberJoined", { nickname: event.nickname }) : event.message;
      case "left": return event.nickname ? t("eventMemberLeft", { nickname: event.nickname }) : event.message;
      case "moved": return event.nickname ? t("eventMemberMoved", { nickname: event.nickname }) : event.message;
      case "poke": return event.nickname ? `${event.nickname} ${t("pokedYou")}` : event.message;
      case "channelCreated": return event.channelName ? t("eventChannelCreated", { channel: event.channelName }) : event.message;
      case "channelRenamed": return event.channelName ? t("eventChannelRenamed", { channel: event.channelName }) : event.message;
      case "channelDeleted": return event.channelName ? t("eventChannelDeleted", { channel: event.channelName }) : event.message;
      default: return event.message;
    }
  }

  return {
    messageDraft,
    privateClientId,
    chatListEl,
    privateConversations,
    visibleChatMessages,
    chatTabLabel,
    chatPanelId,
    chatTabId,
    activeChatTabId,
    chatTitle,
    chatPlaceholder,
    formatTime,
    submitMessage,
    openPrivateChat,
    scrollChatToEnd,
    setChatListElement,
    eventText,
  };
}

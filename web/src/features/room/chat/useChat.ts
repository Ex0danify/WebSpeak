import { computed, nextTick, onScopeDispose, reactive, ref, watch, type Ref } from "vue";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { formatTime as formatTimestamp } from "@/shared/lib/format.js";
import type { ChatTab, TreeChannel } from "@/features/room/roomTypes.js";
import type { Notice } from "@/features/room/chat/groupMessages.js";
import { nicknameText, privateConversationKey, type ChannelMember, type ChatMessage, type ServerEvent } from "@/features/session";
import type { RoomSession } from "@/features/room/roomTypes.js";

// Distance from the end that still counts as being at the bottom, and how long a smooth scroll to the end may take.
const BOTTOM_SLACK_PX = 48;
const AUTO_SCROLL_MS = 600;

export interface UseChatOptions {
  session: Pick<RoomSession["session"], "state">;
  roster: Pick<RoomSession["roster"], "members" | "serverEvents">;
  chat: Pick<RoomSession["chat"], "chatMessages" | "sendTextMessage" | "sendServerMessage" | "sendPrivateMessage">;
  /** Owned by useChannelTree. */
  currentChannel: Ref<TreeChannel | undefined>;
  currentChannelName: Ref<string>;
  selectedChannelId: Ref<string>;
  /** Owned by RoomView: also passed to useChannelTree, whose selectChannel() sets it back to
   *  "channel", so it can't be created here without a circular dependency between the two composables. */
  chatTab: Ref<ChatTab>;
  /** Owned by useMemberMenu: closed when a private chat is opened from the member menu. */
  memberMenu: Ref<{ member: ChannelMember; x: number; y: number } | null>;
  /** Owned by useRoomShell. */
  isMobileViewport: Ref<boolean>;
  mobileSection: Ref<"channels" | "chat" | "voice" | "more">;
}

/** The chat panel, with its channel, server, private and events tabs, the composer, private-conversation derivation, the event
 *  log's sentence building and the scroll-to-end behavior. */
export function useChat(options: UseChatOptions) {
  const { currentChannel, currentChannelName, selectedChannelId, chatTab, memberMenu, isMobileViewport, mobileSection } = options;
  const { state: voiceState } = options.session;
  const { members, serverEvents } = options.roster;
  const { chatMessages, sendTextMessage, sendServerMessage, sendPrivateMessage } = options.chat;
  const { language, t } = useI18n();

  const messageDraft = ref("");
  /** The key of the open private conversation (see privateConversationKey), "" when none is open. */
  const privateConversationId = ref("");
  const chatListEl = ref<HTMLElement | null>(null);
  /** Private chats the reader closed, with the time of their last message then. */
  const closedConversations = reactive(new Map<string, number>());

  function formatTime(timestamp: number) {
    return formatTimestamp(timestamp, language.value);
  }

  const memberOfConversation = (key: string): ChannelMember | undefined =>
    members.find((candidate) => privateConversationKey(candidate.uid, candidate.id) === key);

  const privateConversations = computed(() => {
    const conversations = new Map<string, { id: string; name: string; lastMessage: number }>();
    for (const message of chatMessages) {
      if (message.scope !== "private" || !message.conversationId) continue;
      const existing = conversations.get(message.conversationId);
      conversations.set(message.conversationId, {
        id: message.conversationId,
        // The other person's current nickname, else the name they wrote under, else the one your own message was addressed to.
        // Never the sender's name on a message of your own, that is you.
        name:
          memberOfConversation(message.conversationId)?.nickname ??
          (message.isSelf ? (message.peerName ?? existing?.name) : message.invokerName) ??
          t("privateMessage"),
        lastMessage: Math.max(existing?.lastMessage ?? 0, message.timestamp),
      });
    }
    // A closed chat stays away until the other person writes again.
    for (const [id, closedAt] of closedConversations) {
      if ((conversations.get(id)?.lastMessage ?? 0) <= closedAt) conversations.delete(id);
    }
    // The chat just opened from the member menu has no message yet: list it under the member's name.
    const open = privateConversationId.value;
    if (open && !conversations.has(open)) {
      const member = memberOfConversation(open);
      if (member) conversations.set(open, { id: open, name: member.nickname, lastMessage: 0 });
    }
    return [...conversations.values()].sort((a, b) => b.lastMessage - a.lastMessage);
  });

  /** Set while the open private chat is with someone who is not on the server (they left, or have not come back yet). */
  const privatePeerName = computed(() => {
    if (chatTab.value !== "private" || !privateConversationId.value || memberOfConversation(privateConversationId.value)) return "";
    return privateConversations.value.find((conversation) => conversation.id === privateConversationId.value)?.name ?? t("privateMessage");
  });

  const isCurrentChannelMessage = (message: ChatMessage): boolean => {
    const channelId = currentChannel.value?.id;
    return message.scope === "channel" && (!message.targetId || message.targetId === "0" || !channelId || message.targetId === channelId);
  };

  /** The tab a message belongs to, in the keys ChatPanel uses, null for a message that has no tab. */
  function tabOfMessage(message: ChatMessage): string | null {
    if (message.scope === "server") return "server";
    if (message.scope === "private") return message.conversationId ? `private-${message.conversationId}` : null;
    return isCurrentChannelMessage(message) ? "channel" : null;
  }

  const activeTabKey = computed(() => (chatTab.value === "private" ? `private-${privateConversationId.value}` : chatTab.value));

  const visibleChatMessages = computed(() => chatMessages.filter((message) => tabOfMessage(message) === activeTabKey.value));

  // A message counts as read once its tab was on screen with it. Your own messages never count.
  const readMessageIds = reactive(new Set<string>());
  const chatOnScreen = computed(() => !isMobileViewport.value || mobileSection.value === "chat");
  watch(
    [visibleChatMessages, chatOnScreen],
    () => {
      if (chatOnScreen.value) for (const message of visibleChatMessages.value) readMessageIds.add(message.id);
    },
    { immediate: true },
  );
  const unreadTabs = computed(() => {
    const keys = new Set<string>();
    for (const message of chatMessages) {
      if (message.isSelf || readMessageIds.has(message.id)) continue;
      const key = tabOfMessage(message);
      if (key) keys.add(key);
    }
    return keys;
  });

  const chatTitle = computed(() =>
    chatTab.value === "channel"
      ? t("channelChat", { channel: currentChannelName.value })
      : chatTab.value === "server"
        ? t("serverChat")
        : (privateConversations.value.find((conversation) => conversation.id === privateConversationId.value)?.name ?? t("privateMessage")),
  );
  const chatPlaceholder = computed(() =>
    chatTab.value === "private"
      ? t("privateMessagePlaceholder")
      : chatTab.value === "server"
        ? t("serverMessagePlaceholder")
        : t("sendMessagePlaceholder"),
  );

  // The list follows new messages while it sits at the bottom. Scrolled up, it stays put and "atBottom" turns false.
  const atBottom = ref(true);
  let autoScrolling = false;
  let autoScrollTimer: ReturnType<typeof setTimeout> | undefined;

  const distanceFromBottom = (list: HTMLElement) => list.scrollHeight - list.scrollTop - list.clientHeight;

  function onChatScroll() {
    const list = chatListEl.value;
    if (!list) return;
    const nearBottom = distanceFromBottom(list) <= BOTTOM_SLACK_PX;
    // A smooth scroll to the end passes through positions that are not at the bottom yet.
    if (autoScrolling) {
      if (!nearBottom) return;
      autoScrolling = false;
    }
    atBottom.value = nearBottom;
  }

  function scrollChatToEnd() {
    const list = chatListEl.value;
    if (!list) return;
    atBottom.value = true;
    autoScrolling = true;
    clearTimeout(autoScrollTimer);
    autoScrollTimer = setTimeout(() => (autoScrolling = false), AUTO_SCROLL_MS);
    list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }

  function setChatListElement(element: unknown): void {
    chatListEl.value?.removeEventListener("scroll", onChatScroll);
    chatListEl.value = element instanceof HTMLElement ? element : null;
    chatListEl.value?.addEventListener("scroll", onChatScroll, { passive: true });
  }

  onScopeDispose(() => {
    clearTimeout(autoScrollTimer);
    chatListEl.value?.removeEventListener("scroll", onChatScroll);
  });

  // Your own message always brings you back to the end, someone else's only when you were reading the end.
  watch(
    () => chatMessages.length,
    () => {
      if (atBottom.value || chatMessages.at(-1)?.isSelf) void nextTick(scrollChatToEnd);
    },
  );
  watch([chatTab, privateConversationId], () => nextTick(scrollChatToEnd));

  function submitMessage() {
    if (!messageDraft.value.trim()) return;
    if (chatTab.value === "channel") sendTextMessage(messageDraft.value, currentChannel.value?.id ?? selectedChannelId.value);
    else if (chatTab.value === "server") sendServerMessage(messageDraft.value);
    else if (chatTab.value === "private") {
      // The person may have left since the chat was opened: there is nobody to send to, and the draft stays.
      const recipient = memberOfConversation(privateConversationId.value);
      if (!recipient) return;
      sendPrivateMessage(recipient.id, messageDraft.value, String(recipient.id));
    }
    messageDraft.value = "";
  }

  /** Opens the chat with a member (by client id, from the member menu) or an existing conversation (by key, from its tab). */
  function openPrivateChat(target: number | string): void {
    if (typeof target === "number" && (!target || target === voiceState.tsClientId)) return;
    privateConversationId.value =
      typeof target === "string" ? target : privateConversationKey(members.find((candidate) => candidate.id === target)?.uid, target);
    closedConversations.delete(privateConversationId.value);
    chatTab.value = "private";
    if (isMobileViewport.value) mobileSection.value = "chat";
    memberMenu.value = null;
    void nextTick(scrollChatToEnd);
  }

  /** Takes a private chat off the tab bar. It comes back with the next message from the other person. */
  function closePrivateChat(id: string): void {
    const conversation = privateConversations.value.find((candidate) => candidate.id === id);
    closedConversations.set(id, conversation?.lastMessage ?? 0);
    if (privateConversationId.value !== id) return;
    privateConversationId.value = "";
    chatTab.value = "channel";
  }

  // The gateway sends the kind and the names (an empty one with `unnamed`) and the sentence is built here, so the log follows
  // the language. The switch covers every `ServerEventKind`, a new kind fails to compile until it has a sentence here.
  function eventText(event: ServerEvent): string {
    const nickname = nicknameText(event.nickname ?? "", t);
    const channel = event.channelName || t("unnamedChannel");
    switch (event.kind) {
      case "connection":
        return t("eventConnected");
      case "joined":
        return t("eventMemberJoined", { nickname });
      case "left":
        return t("eventMemberLeft", { nickname });
      case "moved":
        return t("eventMemberMoved", { nickname });
      case "selfMoved":
        return t("eventSelfMoved", { channel });
      case "renamed":
        return t("eventMemberRenamed", { previous: nicknameText(event.previousNickname ?? "", t), nickname });
      case "poke":
        return `${nickname} ${t("pokedYou")}`;
      case "channelCreated":
        return t("eventChannelCreated", { channel });
      case "channelRenamed":
        return t("eventChannelRenamed", { channel });
      case "channelDeleted":
        return t("eventChannelDeleted", { channel });
    }
  }

  /** The sentence for an event in the conversation of the open channel, null when the event belongs somewhere else. */
  function channelNoticeText(event: ServerEvent, channelId: string): string | null {
    switch (event.kind) {
      case "joined":
      case "left":
      case "selfMoved":
        return event.channelId === channelId ? eventText(event) : null;
      case "moved":
        if (event.channelId === channelId) return t("eventMemberMovedIn", { nickname: nicknameText(event.nickname ?? "", t) });
        if (event.fromChannelId !== channelId) return null;
        return t("eventMemberMovedOut", {
          nickname: nicknameText(event.nickname ?? "", t),
          channel: event.channelName || t("unnamedChannel"),
        });
      default:
        return null;
    }
  }

  // Who came and went in the channel you are in, since you got there. Everything before your last move or connect happened
  // somewhere else. The log in the header keeps all of it.
  const channelNotices = computed<Notice[]>(() => {
    const channelId = currentChannel.value?.id;
    if (!channelId || chatTab.value !== "channel") return [];
    let boundary = serverEvents.length - 1;
    while (boundary > 0 && serverEvents[boundary]!.kind !== "selfMoved" && serverEvents[boundary]!.kind !== "connection") boundary--;
    const notices: Notice[] = [];
    for (const event of serverEvents.slice(Math.max(boundary, 0))) {
      const text = channelNoticeText(event, channelId);
      if (text) notices.push({ id: event.id, timestamp: event.timestamp, text, name: event.nickname || undefined });
    }
    return notices;
  });

  // A notice at the end of the list is news like a message is.
  watch(
    () => channelNotices.value.length,
    () => {
      if (atBottom.value) void nextTick(scrollChatToEnd);
    },
  );

  return {
    channelNotices,
    messageDraft,
    privateConversationId,
    privatePeerName,
    chatListEl,
    privateConversations,
    visibleChatMessages,
    unreadTabs,
    chatTitle,
    chatPlaceholder,
    formatTime,
    submitMessage,
    openPrivateChat,
    closePrivateChat,
    atBottom,
    scrollChatToEnd,
    setChatListElement,
    eventText,
  };
}

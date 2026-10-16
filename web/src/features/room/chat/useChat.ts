import { computed, nextTick, ref, watch, type Ref } from "vue";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { formatTime as formatTimestamp } from "@/shared/lib/format.js";
import type { TreeChannel } from "@/features/room/roomTypes.js";
import { nicknameText, privateConversationKey, type ChannelMember, type ServerEvent } from "@/features/session";
import type { RoomSession } from "@/features/room/roomTypes.js";

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

/** The chat panel, with its channel, server, private and events tabs, the composer, private-conversation derivation, the event
 *  log's sentence building and the scroll-to-end behavior. */
export function useChat(options: UseChatOptions) {
  const { currentChannel, currentChannelName, selectedChannelId, chatTab, memberMenu, isMobileViewport, mobileSection } = options;
  const { state: voiceState } = options.session;
  const { members } = options.roster;
  const { chatMessages, sendTextMessage, sendServerMessage, sendPrivateMessage } = options.chat;
  const { language, t } = useI18n();

  const messageDraft = ref("");
  /** The key of the open private conversation (see privateConversationKey), "" when none is open. */
  const privateConversationId = ref("");
  const chatListEl = ref<HTMLElement | null>(null);

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

  const visibleChatMessages = computed(() => {
    if (chatTab.value === "server") return chatMessages.filter((message) => message.scope === "server");
    if (chatTab.value === "private")
      return chatMessages.filter((message) => message.scope === "private" && message.conversationId === privateConversationId.value);
    if (chatTab.value !== "channel") return [];
    const channelId = currentChannel.value?.id;
    return chatMessages.filter(
      (message) =>
        message.scope === "channel" && (!message.targetId || message.targetId === "0" || !channelId || message.targetId === channelId),
    );
  });

  const chatTabLabel = computed(() =>
    chatTab.value === "channel"
      ? t("textChannel")
      : chatTab.value === "server"
        ? t("serverChat")
        : chatTab.value === "private"
          ? t("privateMessage")
          : t("eventLog"),
  );
  const chatTitle = computed(() =>
    chatTab.value === "channel"
      ? t("channelChat", { channel: currentChannelName.value })
      : chatTab.value === "server"
        ? t("serverChat")
        : chatTab.value === "events"
          ? t("eventLog")
          : (privateConversations.value.find((conversation) => conversation.id === privateConversationId.value)?.name ??
            t("privateMessage")),
  );
  const chatPlaceholder = computed(() =>
    chatTab.value === "private"
      ? t("privateMessagePlaceholder")
      : chatTab.value === "server"
        ? t("serverMessagePlaceholder")
        : t("sendMessagePlaceholder"),
  );

  function scrollChatToEnd() {
    const list = chatListEl.value;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }

  function setChatListElement(element: unknown): void {
    chatListEl.value = element instanceof HTMLElement ? element : null;
  }

  watch([() => chatMessages.length, chatTab, privateConversationId], () => nextTick(scrollChatToEnd));

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
    chatTab.value = "private";
    if (isMobileViewport.value) mobileSection.value = "chat";
    memberMenu.value = null;
    void nextTick(scrollChatToEnd);
  }

  // The gateway sends the kind and the names (an empty one with `unnamed`) and the sentence is built here, so the log follows
  // the language. `message` (English) is only shown for a kind this client does not know.
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
      case "poke":
        return `${nickname} ${t("pokedYou")}`;
      case "channelCreated":
        return t("eventChannelCreated", { channel });
      case "channelRenamed":
        return t("eventChannelRenamed", { channel });
      case "channelDeleted":
        return t("eventChannelDeleted", { channel });
      default:
        return event.message;
    }
  }

  return {
    messageDraft,
    privateConversationId,
    privatePeerName,
    chatListEl,
    privateConversations,
    visibleChatMessages,
    chatTabLabel,
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

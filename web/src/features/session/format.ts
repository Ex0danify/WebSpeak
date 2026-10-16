import type { MessageKey } from "@/shared/i18n/messageKeys";
import type { ChannelMember, ChatMessage } from "@/features/session/sessionTypes.js";

export function messageAvatar(message: ChatMessage, members: ChannelMember[]): string {
  const member = members.find(
    (candidate) =>
      (typeof message.senderId === "number" && candidate.id === message.senderId) ||
      (Boolean(message.senderUid) && candidate.uid === message.senderUid),
  );
  return member?.avatar ?? "";
}

/**
 * Identifies a private conversation by the other person's TeamSpeak unique id. The numeric client id is handed out again
 * after someone leaves, so it only stands in for a client that has no uid yet.
 */
export function privateConversationKey(uid: string | undefined, clientId: number): string {
  return uid ? `uid:${uid}` : `id:${clientId}`;
}

export function isSpeaking(member: ChannelMember, speakingIds: Set<number>): boolean {
  return speakingIds.has(member.id);
}

/** The name to show for a nickname: a nameless client arrives as an empty string plus `unnamed`. */
export function nicknameText(nickname: string, t: (key: MessageKey) => string, unnamed?: boolean): string {
  return unnamed || !nickname ? t("unnamedMember") : nickname;
}

export function channelNameText(channel: { name: string; unnamed?: boolean }, t: (key: MessageKey) => string): string {
  return channel.unnamed || !channel.name ? t("unnamedChannel") : channel.name;
}

export function memberDisplayName(member: ChannelMember, t: (key: MessageKey) => string): string {
  const name = nicknameText(member.nickname, t, member.unnamed);
  return member.isSelf ? `${name}${t("selfSuffix")}` : name;
}

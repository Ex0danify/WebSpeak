import type { ChannelMember, ChatMessage } from "./sessionTypes.js";

export function messageAvatar(message: ChatMessage, members: ChannelMember[]): string {
  const member = members.find((candidate) =>
    (typeof message.senderId === "number" && candidate.id === message.senderId) ||
    (Boolean(message.senderUid) && candidate.uid === message.senderUid),
  );
  return member?.avatar ?? "";
}

export function isSpeaking(member: ChannelMember, speakingIds: Set<number>): boolean {
  return speakingIds.has(member.id);
}

export function memberDisplayName(member: ChannelMember, t: (key: string) => string): string {
  return member.isSelf ? `${member.nickname}${t("selfSuffix")}` : member.nickname;
}

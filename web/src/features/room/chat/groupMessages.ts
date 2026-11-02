import type { ChatMessage } from "@/features/session";

export interface MessageGroup {
  /** The id of the first message, stable while later ones are added. */
  id: string;
  isSelf: boolean;
  invokerName: string;
  senderUid?: string;
  messages: ChatMessage[];
}

/** A pause this long starts a new group even for the same sender, so the time in the header stays meaningful. */
const GROUP_GAP_MS = 5 * 60 * 1000;

const senderOf = (message: ChatMessage): string => (message.isSelf ? "self" : (message.senderUid ?? message.invokerName));

/** Consecutive messages from one sender share a header and an avatar. */
export function groupMessages(messages: readonly ChatMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const message of messages) {
    const last = groups.at(-1);
    const previous = last?.messages.at(-1);
    if (last && previous && senderOf(previous) === senderOf(message) && message.timestamp - previous.timestamp <= GROUP_GAP_MS) {
      last.messages.push(message);
      continue;
    }
    groups.push({
      id: message.id,
      isSelf: Boolean(message.isSelf),
      invokerName: message.invokerName,
      senderUid: message.senderUid,
      messages: [message],
    });
  }
  return groups;
}

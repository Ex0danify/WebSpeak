import type { ChatMessage } from "@/features/session";

export interface MessageGroup {
  /** The id of the first message, stable while later ones are added. */
  id: string;
  isSelf: boolean;
  invokerName: string;
  senderUid?: string;
  messages: ChatMessage[];
}

/** A line in the conversation that is not a message: someone came or went. */
export interface Notice {
  id: string;
  timestamp: number;
  text: string;
  /** The name inside `text` that gets the stronger weight. */
  name?: string;
}

export type TimelineItem = { kind: "group"; group: MessageGroup } | { kind: "notice"; notice: Notice };

/** A pause this long starts a new group even for the same sender, so the time in the header stays meaningful. */
const GROUP_GAP_MS = 5 * 60 * 1000;

const senderOf = (message: ChatMessage): string => (message.isSelf ? "self" : (message.senderUid ?? message.invokerName));

const continues = (group: MessageGroup, message: ChatMessage): boolean => {
  const previous = group.messages.at(-1)!;
  return senderOf(previous) === senderOf(message) && message.timestamp - previous.timestamp <= GROUP_GAP_MS;
};

/** Messages and notices in time order. Consecutive messages from one sender share a header and an avatar, a notice ends a group. */
export function buildTimeline(messages: readonly ChatMessage[], notices: readonly Notice[] = []): TimelineItem[] {
  const items: TimelineItem[] = [];
  let open: MessageGroup | null = null;
  let nextNotice = 0;
  const flushNoticesUntil = (timestamp: number) => {
    while (nextNotice < notices.length && notices[nextNotice]!.timestamp <= timestamp) {
      items.push({ kind: "notice", notice: notices[nextNotice++]! });
      open = null;
    }
  };
  for (const message of messages) {
    flushNoticesUntil(message.timestamp);
    if (open && continues(open, message)) {
      open.messages.push(message);
      continue;
    }
    open = {
      id: message.id,
      isSelf: Boolean(message.isSelf),
      invokerName: message.invokerName,
      senderUid: message.senderUid,
      messages: [message],
    };
    items.push({ kind: "group", group: open });
  }
  flushNoticesUntil(Number.POSITIVE_INFINITY);
  return items;
}

/** `text` cut around the first `name` in it, for setting the name in a stronger weight. */
export function splitAroundName(text: string, name: string | undefined): [string, string, string] {
  const at = name ? text.indexOf(name) : -1;
  return at < 0 || !name ? [text, "", ""] : [text.slice(0, at), name, text.slice(at + name.length)];
}

import { useSessionStore } from "./sessionStore";
import type { ServerEvent, ServerMessage, ServerMessageType } from "./sessionTypes";

/** Gateway control frame handlers, keyed by `type`; each one receives the matching `ServerMessage` variant.
 *  The JSON is parsed but not validated at runtime, so handlers still guard fields the gateway may omit. */
export type MessageHandlers = {
  [K in ServerMessageType]?: (msg: Extract<ServerMessage, { type: K }>) => void;
};

/** Roster, chat, server event and poke frames: they only write the session store, so they belong to no
 *  audio or transport module. */
export function createRosterHandlers(deps: { syncKnownMemberVolumes: () => void }): MessageHandlers {
  const { state, members, channels, chatMessages, serverEvents, pokeNotifications } = useSessionStore();
  const { syncKnownMemberVolumes } = deps;

  return {
    memberEnter: (msg) => {
      if (!members.some((member) => member.id === msg.id)) {
        members.push({ id: msg.id, nickname: msg.nickname, uid: typeof msg.uid === "string" ? msg.uid : undefined, avatar: typeof msg.avatar === "string" ? msg.avatar : undefined, isSelf: Boolean(msg.isSelf) });
        syncKnownMemberVolumes();
      }
    },
    channelList: (msg) => {
      channels.length = 0;
      if (Array.isArray(msg.channels)) {
        for (const channel of msg.channels) channels.push(channel);
      }
      syncKnownMemberVolumes();
    },
    memberAvatar: (msg) => {
      const clientId = Number(msg.id);
      const uid = typeof msg.uid === "string" ? msg.uid : "";
      const avatar = typeof msg.avatar === "string" ? msg.avatar : "";
      const member = members.find((candidate) => candidate.id === clientId && (!uid || candidate.uid === uid));
      if (member) member.avatar = avatar || undefined;
      for (const channel of channels) {
        const channelMember = channel.members?.find((candidate) => candidate.id === clientId && (!uid || candidate.uid === uid));
        if (channelMember) channelMember.avatar = avatar || undefined;
      }
    },
    chatMessage: (msg) => {
      if (Number(msg.invokerId) === state.tsClientId) return;
      const incomingScope = msg.scope === "private" || msg.scope === "server" || msg.scope === "channel" ? msg.scope : "system";
      const rawTargetId = typeof msg.targetId === "string" || typeof msg.targetId === "number" ? String(msg.targetId) : undefined;
      // Older gateways and TeamSpeak channel notifications may use 0 as
      // the broadcast sentinel. It must not be compared with a channel id.
      const incomingTargetId = rawTargetId && rawTargetId !== "0" ? rawTargetId : undefined;
      chatMessages.push({
        id: `remote-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        scope: incomingScope,
        ...(incomingTargetId ? { targetId: incomingTargetId } : {}),
        ...(incomingScope === "private" ? { conversationId: String(Number(msg.invokerId) || 0) } : {}),
        senderId: Number(msg.invokerId) || undefined,
        senderUid: typeof msg.senderUid === "string" ? msg.senderUid : undefined,
        invokerName: String(msg.invokerName || "Unknown"),
        message: String(msg.message || ""),
        timestamp: typeof msg.timestamp === "number" ? msg.timestamp : Date.now(),
      });
    },
    serverEvent: (msg) => {
      if (msg.event && typeof msg.event.id === "string") serverEvents.push(msg.event as ServerEvent);
    },
    pokeReceived: (msg) => {
      pokeNotifications.push({
        id: `poke-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        invokerId: Number(msg.invokerId) || 0,
        invokerUid: typeof msg.invokerUid === "string" ? msg.invokerUid : "",
        invokerName: String(msg.invokerName || "Unknown"),
        message: String(msg.message || ""),
        timestamp: typeof msg.timestamp === "number" ? msg.timestamp : Date.now(),
      });
    },
  };
}

/** Merges the per-module handler maps into one dispatcher. An unknown, missing or non-string `type` is
 *  ignored, as the old `switch` did (a Map cannot be fooled by "constructor" or an array-valued type).
 *  A type claimed by two maps is a wiring bug and throws at construction. */
export function createMessageRouter(...maps: MessageHandlers[]): (msg: unknown) => void {
  // `msg` is the raw parsed frame (it may even be null), so the entry point takes `unknown`; the table below is typed.
  const table = new Map<string, (msg: ServerMessage) => void>();
  for (const map of maps) {
    for (const [type, handler] of Object.entries(map) as [string, (msg: ServerMessage) => void][]) {
      if (table.has(type)) throw new Error(`duplicate message handler: ${type}`);
      table.set(type, handler);
    }
  }
  return (msg) => {
    const type = (msg as ServerMessage).type;
    if (typeof type !== "string") return;
    table.get(type)?.(msg as ServerMessage);
  };
}

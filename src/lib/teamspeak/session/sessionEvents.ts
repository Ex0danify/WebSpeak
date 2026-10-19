import type { ServerCommand } from "../command/commandTracker.js";
import type { ChannelFields, SessionChannel } from "./channelTree.js";
import type { ClientFields, SessionClient } from "./clientRegistry.js";
import type { Invoker } from "./propertyFields.js";
import type { ServerFields, SessionServer } from "./serverInfo.js";

/** Reason ids of enter, move and leave notifications. */
export const ReasonId = {
  /** Moved by itself, also a client that connects while we are there. */
  switched: 0,
  movedByOther: 1,
  /** Already there when we connected or subscribed to its channel. */
  entered: 2,
  timeout: 3,
  kickedFromChannel: 4,
  kickedFromServer: 5,
  banned: 6,
  leaving: 8,
  edited: 10,
  serverShutdown: 11,
} as const;

/** Every event comes after the state already shows the change. */
export type SessionEvent =
  | { type: "welcomeComplete" }
  | { type: "clientEnter"; client: SessionClient; fromChannelId: bigint; reasonId: number; invoker: Invoker | undefined }
  /** Also for a client that went to a channel we do not see, then `toChannelId` is not 0. */
  | {
      type: "clientLeave";
      client: SessionClient;
      toChannelId: bigint;
      reasonId: number;
      reasonMessage: string;
      invoker: Invoker | undefined;
    }
  | { type: "clientMoved"; client: SessionClient; fromChannelId: bigint; reasonId: number; invoker: Invoker | undefined }
  | { type: "clientUpdated"; client: SessionClient; changed: readonly (keyof ClientFields)[] }
  /** Our own leave: kick, ban, timeout or our disconnect. The connection is over after it. */
  | {
      type: "selfLeft";
      reasonId: number;
      reasonMessage: string;
      invoker: Invoker | undefined;
      /** Seconds, for a ban. */
      banTime: number | undefined;
    }
  | { type: "channelCreated"; channel: SessionChannel; invoker: Invoker | undefined }
  | { type: "channelEdited"; channel: SessionChannel; changed: readonly (keyof ChannelFields)[]; invoker: Invoker | undefined }
  | { type: "channelMoved"; channel: SessionChannel; fromParentId: bigint; invoker: Invoker | undefined }
  /** The channel with its subchannels, and the clients the server left in them. */
  | { type: "channelDeleted"; channels: readonly SessionChannel[]; clients: readonly SessionClient[]; invoker: Invoker | undefined }
  | { type: "channelsSubscribed"; channels: readonly SessionChannel[] }
  /** The clients in them are out of view now. */
  | { type: "channelsUnsubscribed"; channels: readonly SessionChannel[]; clients: readonly SessionClient[] }
  | { type: "serverUpdated"; server: SessionServer; changed: readonly (keyof ServerFields)[]; invoker: Invoker | undefined }
  | { type: "groupsUpdated"; kind: "server" | "channel" }
  /** `targetMode` 1 private, 2 channel, 3 server. */
  | { type: "textMessage"; targetMode: number; targetClientId: number | undefined; message: string; invoker: Invoker }
  | { type: "poked"; message: string; invoker: Invoker }
  /** Everything the session does not apply, as the server sent it. */
  | { type: "notification"; command: ServerCommand };

export type SessionEventType = SessionEvent["type"];

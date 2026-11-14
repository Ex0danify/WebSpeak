import type { SessionChannel } from "./channelTree.js";
import type { SessionClient } from "./clientRegistry.js";

// The shape the gateway's TSClient hands on today, field names included.

export interface DirectoryChannel {
  id: bigint;
  parentID: bigint;
  /** The sibling this channel sits below. */
  order: bigint;
  name: string;
  description: string;
  hasPassword: boolean;
}

export interface DirectoryClient {
  id: number;
  nickname: string;
  uid: string;
  serverGroups: string[];
  /** The group the client has in its current channel, 0 when the server did not say. */
  channelGroupId: number;
  channelID: bigint;
  type: number;
  away: boolean;
  awayMessage: string;
  inputMuted: boolean;
  outputMuted: boolean;
  channelCommander: boolean;
  streaming: boolean;
}

export interface DirectorySnapshot {
  channels: DirectoryChannel[];
  clients: DirectoryClient[];
}

export const directoryChannel = (channel: SessionChannel): DirectoryChannel => ({
  id: channel.id,
  parentID: channel.parentId,
  order: channel.order,
  name: channel.name,
  description: channel.topic,
  hasPassword: channel.hasPassword,
});

export const directoryClient = (client: SessionClient): DirectoryClient => ({
  id: client.id,
  nickname: client.nickname,
  uid: client.uid,
  serverGroups: client.serverGroups.map(String),
  channelGroupId: client.channelGroupId,
  channelID: client.channelId,
  type: client.type,
  away: client.away,
  awayMessage: client.awayMessage,
  inputMuted: client.inputMuted,
  outputMuted: client.outputMuted,
  channelCommander: client.channelCommander,
  streaming: client.streaming,
});

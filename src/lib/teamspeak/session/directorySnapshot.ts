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
}

export interface DirectoryClient {
  id: number;
  nickname: string;
  uid: string;
  serverGroups: string[];
  channelID: bigint;
  type: number;
  away: boolean;
  awayMessage: string;
  inputMuted: boolean;
  outputMuted: boolean;
  channelCommander: boolean;
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
});

export const directoryClient = (client: SessionClient): DirectoryClient => ({
  id: client.id,
  nickname: client.nickname,
  uid: client.uid,
  serverGroups: client.serverGroups.map(String),
  channelID: client.channelId,
  type: client.type,
  away: client.away,
  awayMessage: client.awayMessage,
  inputMuted: client.inputMuted,
  outputMuted: client.outputMuted,
  channelCommander: client.channelCommander,
});

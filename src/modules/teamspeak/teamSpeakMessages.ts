import type { DirectoryChannel, DirectoryClient } from "../../lib/teamspeak/index.js";

// Event payloads of TSClient. Their field names come from the old SDK and the voice module reads them as they are.

export interface TSVoiceData {
  clientId: number;
  codec: number; // 4 = voice, 5 = music
  data: Buffer;
}

export type TSChatScope = "channel" | "server" | "private";

export interface TSChatMessage {
  invokerName: string;
  invokerId: number;
  invokerUid: string;
  message: string;
  targetMode: number;
  targetId: bigint;
}

/** A server group as the server lists it. `iconId` 0 means none, below 1000 a built-in icon. */
export interface TSGroup {
  id: number;
  name: string;
  /** The group the server gives everyone, losing the last other group hands it back. */
  isDefault: boolean;
  /** 0 template, 1 regular, 2 query. */
  type: number;
  sortId: number;
  iconId: number;
  /** Power needed to put a member in, or take one out of, this group. */
  memberAddPower: number;
  memberRemovePower: number;
}

export interface TSClientInfo {
  id: number;
  nickname: string;
  uid: string;
  serverGroups: string[];
  channelID: bigint;
  type: number;
}

/** Status fields are missing for a client the gateway adds itself before the server told it. */
export type TSDirectoryClient = TSClientInfo & Partial<Omit<DirectoryClient, keyof TSClientInfo>>;
export type TSDirectoryChannel = DirectoryChannel;

export interface TSDirectorySnapshot {
  channels: TSDirectoryChannel[];
  clients: TSDirectoryClient[];
}

export interface TSClientLeave {
  id: number;
  reasonID: number;
  reasonMsg: string;
  targetID: number;
}

export interface TSClientMoved {
  id: number;
  targetChannelID: bigint;
  reasonID: number;
  invokerID: number;
  invokerName: string;
  invokerUID: string;
}

export interface TSPoke {
  invokerID: number;
  invokerName: string;
  invokerUID: string;
  message: string;
}

/** A client was given or lost a group. The invoker id is 0 when the server did it itself. */
export interface TSGroupChange {
  kind: "server" | "channel";
  groupId: number;
  clientId: number;
  assigned: boolean;
  invokerId: number;
  invokerName: string;
}

export interface TSRawNotification {
  name: string;
  params: Record<string, string>;
}

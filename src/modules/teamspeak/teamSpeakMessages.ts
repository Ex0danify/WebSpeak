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

export interface TSRawNotification {
  name: string;
  params: Record<string, string>;
}

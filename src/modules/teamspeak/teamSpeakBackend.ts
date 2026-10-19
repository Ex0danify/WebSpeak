import type { EventEmitter } from "node:events";
import type { CommandPriority, CommandRequest, Identity, VersionProfile, VersionProfileName } from "../../lib/teamspeak/index.js";
import type { Logger } from "../../shared/logger.js";
import type { WebSpeakError } from "../../shared/errors.js";
import type { TeamSpeakProtocol } from "../../shared/teamSpeakProtocol.js";
import type { TeamSpeakTarget } from "../../shared/teamSpeakTarget.js";
import type {
  TSChatMessage,
  TSClientInfo,
  TSClientLeave,
  TSClientMoved,
  TSDirectoryClient,
  TSDirectorySnapshot,
  TSPoke,
  TSRawNotification,
  TSVoiceData,
} from "./teamSpeakMessages.js";

export interface TSClientAvatar {
  /** TeamSpeak's avatar content marker, used to invalidate a cached avatar. */
  cacheKey: string;
  data: Buffer;
}

// Room for avatars from the native client. The old 120 KiB limit rejected a 134 KiB PNG,
// so every avatar silently fell back to its initial letter.
export const MAX_CLIENT_AVATAR_BYTES = 256 * 1024;

/** What TSClient re-emits, in the shapes the voice module reads. */
export interface TeamSpeakBackendEvents {
  voiceData: [TSVoiceData];
  directorySnapshot: [TSDirectorySnapshot];
  rawNotification: [TSRawNotification];
  textMessage: [TSChatMessage];
  poked: [TSPoke];
  clientEnter: [TSClientInfo];
  clientLeave: [TSClientLeave];
  clientMoved: [TSClientMoved];
  clientUpdated: [TSDirectoryClient];
  kicked: [WebSpeakError];
  disconnected: [Error | undefined];
}

export interface TeamSpeakBackendOptions {
  /** Where the UDP traffic goes, the acceleration tunnel's local end when there is one. */
  transportTarget: TeamSpeakTarget;
  /** The server itself, for the file transfer port. */
  serverHost: string;
  nickname: string;
  identity: Identity;
  serverPassword?: string;
  defaultChannel?: string;
  channelPassword?: string;
  versionProfile?: VersionProfileName;
  /** An explicit version that overrides the named profile. */
  version?: VersionProfile;
}

/** One connection attempt. TSClient builds a new backend after the tunnel closed or disconnect() ran. */
export interface TeamSpeakBackend extends EventEmitter<TeamSpeakBackendEvents> {
  readonly protocol: TeamSpeakProtocol | null;
  /** Resolves once the server welcomed us, rejects with an error normalizeTeamSpeakError understands. */
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** 0 before the server assigned one. */
  clientId(): number;
  channelId(): bigint;
  /**
   * Answer rows, rejects with the server's refusal. `background` commands run through the client's
   * scheduler after interactive ones and are retried after a flood refusal (the post-connect burst).
   */
  command(request: CommandRequest | string, timeoutMs?: number, priority?: CommandPriority): Promise<Record<string, string>[]>;
  /** For commands whose answer comes as a notification. */
  send(text: string): Promise<void>;
  sendVoice(data: Buffer, codec: number): void;
  sendWhisper(data: Buffer, clientIds: number[], codec: number): void;
  /** Null for a client without avatar, or one that is not `expectedUid` (any more). */
  loadAvatar(clientId: number, expectedUid: string): Promise<TSClientAvatar | null>;
  /** After channelsubscribeall: hands the full directory to the listeners. */
  syncDirectory(): Promise<void>;
}

export type TeamSpeakBackendFactory = (options: TeamSpeakBackendOptions, logger: Logger) => TeamSpeakBackend;

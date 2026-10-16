import type { Logger } from "../../shared/logger.js";
import type { TeamSpeakTarget } from "../../shared/teamSpeakTarget.js";
import type { ScreenShareIceServer } from "./screenShareProtocol.js";

/** What screen share needs from a TS client. Structural, so voice's TSClient fits without importing teamspeak. */
export interface ScreenShareTeamSpeakClient {
  getClientId(): number;
  getChannelId(): bigint;
  isConnected(): boolean;
  sendProtocolCommand(command: string): Promise<void>;
}

export interface ScreenShareSocket {
  readonly readyState: number;
  send(data: string): void;
}

/** What screen share needs from one browser session. Structural, voice's WebClientEntry fits without this module importing voice. */
export interface ScreenShareParticipant {
  readonly id: string;
  readonly nickname: string;
  readonly screenPeerId: string;
  readonly target: TeamSpeakTarget;
  readonly tsClient: ScreenShareTeamSpeakClient;
  readonly ws: ScreenShareSocket;
  /** Only the client ids are read, the values are the session's own member records. */
  readonly members: ReadonlyMap<number, unknown>;
  /** The channel of any client this session knows of, undefined when it does not know the client. */
  clientChannelId?(clientId: number): bigint | undefined;
}

export type ScreenShareSendJson = (message: Record<string, unknown>) => void;

/** What the hub needs from its bridge: live session lookups (as functions, the registry is not shared) and the ICE servers. */
export interface ScreenShareHost {
  getParticipant(entryId: string): ScreenShareParticipant | undefined;
  participants(): Iterable<ScreenShareParticipant>;
  getIceServers(): ScreenShareIceServer[];
  /** The voice bridge's child logger so log lines keep component voice-bridge. */
  readonly logger: Logger;
}

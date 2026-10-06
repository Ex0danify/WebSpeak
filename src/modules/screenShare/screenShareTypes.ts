import type { Logger } from "../../shared/logger.js";
import type { TeamSpeakTarget } from "../../shared/teamSpeakTarget.js";
import type { ScreenShareIceServer } from "./screenShareProtocol.js";

/**
 * What screen share needs from a TeamSpeak client. Structural, so the voice
 * module's `TSClient` satisfies it without this module importing `teamspeak`.
 */
export interface ScreenShareTeamSpeakClient {
  getClientId(): number;
  getChannelId(): bigint;
  isConnected(): boolean;
  sendProtocolCommand(command: string): Promise<void>;
}

/** The slice of a roster member that screen share reads (the viewer avatar). */
export interface ScreenShareMember {
  avatar?: string;
}

/** The slice of a browser socket that screen share writes to. */
export interface ScreenShareSocket {
  readonly readyState: number;
  send(data: string): void;
}

/**
 * What screen share needs from one browser session. Structural: the voice
 * module's `WebClientEntry` already satisfies it, and this module never names
 * `WebClientEntry` (the screen-share module must not import `voice`).
 */
export interface ScreenShareParticipant {
  readonly id: string;
  readonly nickname: string;
  readonly screenPeerId: string;
  readonly target: TeamSpeakTarget;
  readonly tsClient: ScreenShareTeamSpeakClient;
  readonly ws: ScreenShareSocket;
  readonly members: ReadonlyMap<number, ScreenShareMember>;
}

/** Sends one JSON message to a single browser session. */
export type ScreenShareSendJson = (message: Record<string, unknown>) => void;

/**
 * What the hub needs from the bridge that owns it: a lookup over the live
 * sessions (passed as functions, the registry itself is not shared) and the
 * ICE servers handed to browsers.
 */
export interface ScreenShareHost {
  getParticipant(entryId: string): ScreenShareParticipant | undefined;
  participants(): Iterable<ScreenShareParticipant>;
  getIceServers(): ScreenShareIceServer[];
  /** The voice bridge's child logger, so screen-share log lines keep `component: "voice-bridge"`. */
  readonly logger: Logger;
}

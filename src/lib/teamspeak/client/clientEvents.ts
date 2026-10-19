import type { TeamSpeakTransportError } from "../errors/teamSpeakErrors.js";
import type { SessionEvent } from "../session/sessionEvents.js";
import type { VoiceEvent } from "./clientVoice.js";

/**
 * After a successful connect only, once. Without an error the close was ours, or the server sent
 * our own leave before (`selfLeft`).
 */
export interface ClosedEvent {
  type: "closed";
  error: TeamSpeakTransportError | undefined;
}

export type ConnectionEvent = SessionEvent | ClosedEvent | VoiceEvent;

export type ConnectionEventMap = { [E in ConnectionEvent as E["type"]]: [event: E] };

import type { SessionAudioSummary } from "../audio/audioStats.js";

export interface SessionStart {
  id: string;
  nickname: string;
  clientIp: string;
  target: string;
  relay?: { name: string; target: string };
  userAgent?: string;
}

export interface SessionEnd {
  /** Why the gateway tore the session down, a socket that closed or an admin that ended it. */
  reason: string;
  /** Set when the connection to the TeamSpeak server failed. */
  failureCode?: string;
  failureDetail?: string;
  durationSeconds: number;
  audio: SessionAudioSummary | null;
}

/** Where the admin side keeps the history of sessions, the bridge only reports. */
export interface SessionRecorder {
  started(session: SessionStart): void;
  connected(sessionId: string): void;
  ended(sessionId: string, end: SessionEnd): void;
  capacityReached(maxSessions: number): void;
}

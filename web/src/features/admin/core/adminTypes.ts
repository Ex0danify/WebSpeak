export interface AdminSession {
  id: string;
  nickname: string;
  target: string;
  state: string;
  createdAt: string;
  ageSeconds: number;
  tsClientId: number | null;
  channelId: string | null;
  memberCount: number;
}
export interface AdminServer {
  id: string;
  name: string;
  target: string;
  hasPassword: boolean;
  lastTestAt: string | null;
  lastTestLatencyMs: number | null;
  lastTestError: string | null;
}
export interface ManagedInvite {
  id: string;
  target: string;
  channel: string;
  expiresAt: string;
  maxUses: number;
  useCount: number;
  createdAt: string;
  revokedAt: string | null;
  status: "active" | "expired" | "exhausted" | "revoked";
}
export type AdminEventCategory = "auth" | "config" | "invites" | "availability" | "sessions" | "system";
export type AdminEventSeverity = "info" | "warning" | "error";
export interface AdminEvent {
  id: number;
  event: string;
  category: AdminEventCategory;
  severity: AdminEventSeverity;
  details: Record<string, unknown>;
  createdAt: string;
}
export interface AdminConnectionAudio {
  talkSeconds: number;
  framesSent: number;
  framesReceived: number;
  droppedFrames: number;
  sendErrors: number;
}
export interface AdminConnectionRecord {
  id: string;
  nickname: string;
  clientIp: string;
  target: string;
  relayName: string | null;
  relayTarget: string | null;
  startedAt: string;
  connectedAt: string | null;
  disconnectedAt: string | null;
  durationSeconds: number | null;
  status: "active" | "connecting" | "disconnected" | "failed";
  reason: string | null;
  failureDetail: string | null;
  audio: AdminConnectionAudio | null;
}

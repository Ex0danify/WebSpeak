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
export interface AdminLog {
  timestamp: string | null;
  level: string;
  message: string;
  context: Record<string, string | number | boolean>;
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
}

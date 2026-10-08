import type { TeamSpeakProtocol } from "../../shared/teamSpeakProtocol.js";

export type AccessMode = "fixed" | "open";

export interface PersistedSettings {
  siteName: string;
  /** Non-empty welcome texts by language code. */
  welcomeTexts: Record<string, string>;
  accessMode: AccessMode;
  tsHost: string;
  tsPort: number;
  tsPasswordEncrypted: string | null;
  detectedProtocol: TeamSpeakProtocol | null;
  lastTestAt: string | null;
  lastTestLatencyMs: number | null;
  lastTestError: string | null;
  webRtcEnabled: boolean;
  webRtcUdpStart: number;
  webRtcUdpEnd: number;
  relayConfigured: boolean;
  relayEnabled: boolean;
  relayName: string;
  relayHost: string;
  relayPort: number;
  relayTokenEncrypted: string | null;
  updatedAt: string;
}

export interface SettingsUpdate {
  siteName: string;
  /** Replaces the stored welcome texts; empty values are not stored. */
  welcomeTexts?: Record<string, string>;
  accessMode: AccessMode;
  tsHost: string;
  tsPort: number;
  tsPasswordEncrypted: string | null;
  webRtcEnabled: boolean;
  webRtcUdpStart?: number;
  webRtcUdpEnd?: number;
  relayConfigured: boolean;
  relayEnabled: boolean;
  relayName: string;
  relayHost: string;
  relayPort: number;
  relayTokenEncrypted: string | null;
}

export interface PersistedRelayNode {
  id: string;
  name: string;
  enabled: boolean;
  host: string;
  port: number;
  tokenEncrypted: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ManagedInviteRecord {
  id: string;
  tokenHash: string;
  targetHost: string;
  targetPort: number;
  serverPasswordEncrypted: string | null;
  channel: string;
  expiresAt: string;
  maxUses: number;
  useCount: number;
  createdAt: string;
  revokedAt: string | null;
}

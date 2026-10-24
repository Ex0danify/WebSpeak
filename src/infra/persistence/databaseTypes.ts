/** "fixed" offers the configured server list only, "open" also takes an address typed by the visitor. */
export type AccessMode = "fixed" | "open";

export interface PersistedSettings {
  siteName: string;
  /** Non-empty welcome texts by language code. */
  welcomeTexts: Record<string, string>;
  accessMode: AccessMode;
  webRtcEnabled: boolean;
  webRtcUdpStart: number;
  webRtcUdpEnd: number;
  identityMintMaxLevel: number;
  identityMintConcurrency: number;
  identityMintQueueDepth: number;
  updatedAt: string;
}

export interface SettingsUpdate {
  siteName: string;
  /** Replaces the stored welcome texts, empty values are not stored. */
  welcomeTexts?: Record<string, string>;
  accessMode: AccessMode;
  webRtcEnabled: boolean;
  webRtcUdpStart?: number;
  webRtcUdpEnd?: number;
  identityMintMaxLevel?: number;
  identityMintConcurrency?: number;
  identityMintQueueDepth?: number;
}

export interface PersistedServer {
  id: string;
  name: string;
  host: string;
  port: number;
  passwordEncrypted: string | null;
  lastTestAt: string | null;
  lastTestLatencyMs: number | null;
  lastTestError: string | null;
  createdAt: string;
  updatedAt: string;
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
  /** The server the invite was made for, revoking follows its removal or change. */
  serverId: string | null;
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

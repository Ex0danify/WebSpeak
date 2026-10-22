import type { ManagedInviteRecord } from "./databaseTypes.js";

export interface ManagedInviteRow extends Record<string, unknown> {
  id: string;
  token_hash: string;
  target_host: string;
  target_port: number;
  server_password_encrypted: string | null;
  channel: string;
  expires_at: string;
  max_uses: number;
  use_count: number;
  created_at: string;
  revoked_at: string | null;
}

export interface SettingsRow extends Record<string, unknown> {
  site_name: string;
  access_mode: string;
  ts_host: string;
  ts_port: number;
  ts_password_encrypted: string | null;
  detected_protocol: string | null;
  last_test_at: string | null;
  last_test_latency_ms: number | null;
  last_test_error: string | null;
  webrtc_enabled: number;
  webrtc_public_host: string;
  webrtc_udp_start: number;
  webrtc_udp_end: number;
  identity_mint_max_level: number;
  identity_mint_concurrency: number;
  identity_mint_queue_depth: number;
  relay_configured: number;
  relay_enabled: number;
  relay_name: string;
  relay_host: string;
  relay_port: number;
  relay_token_encrypted: string | null;
  updated_at: string;
}

export interface WelcomeTextRow extends Record<string, unknown> {
  language: string;
  text: string;
}

export interface RelayNodeRow extends Record<string, unknown> {
  id: string;
  name: string;
  enabled: number;
  host: string;
  port: number;
  token_encrypted: string | null;
  created_at: string;
  updated_at: string;
}

export function mapManagedInviteRow(row: ManagedInviteRow): ManagedInviteRecord {
  return {
    id: row.id,
    tokenHash: row.token_hash,
    targetHost: row.target_host,
    targetPort: row.target_port,
    serverPasswordEncrypted: row.server_password_encrypted,
    channel: row.channel,
    expiresAt: row.expires_at,
    maxUses: row.max_uses,
    useCount: row.use_count,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  };
}

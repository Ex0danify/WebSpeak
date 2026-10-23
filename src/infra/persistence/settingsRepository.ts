import type { TeamSpeakProtocol } from "../../shared/teamSpeakProtocol.js";
import { DEFAULT_WEBRTC_UDP_PORT_RANGE } from "../../config/webrtcConfig.js";
import { DEFAULT_IDENTITY_MINT_POLICY } from "../../config/identityMintConfig.js";
import type { SettingsRow, WelcomeTextRow } from "./databaseRows.js";
import type { PersistedSettings, SettingsUpdate } from "./databaseTypes.js";
import type { PersistenceContext } from "./persistenceContext.js";

export class SettingsRepository {
  constructor(private readonly context: PersistenceContext) {}

  get(): PersistedSettings {
    const row = this.context.database.prepare("SELECT * FROM settings WHERE id = 1").get() as SettingsRow;
    return {
      siteName: row.site_name,
      welcomeTexts: this.readWelcomeTexts(),
      accessMode: row.access_mode === "open" ? "open" : "fixed",
      tsHost: row.ts_host,
      tsPort: row.ts_port,
      tsPasswordEncrypted: row.ts_password_encrypted,
      detectedProtocol: row.detected_protocol === "ts3" || row.detected_protocol === "ts6" ? row.detected_protocol : null,
      lastTestAt: row.last_test_at,
      lastTestLatencyMs: row.last_test_latency_ms,
      lastTestError: row.last_test_error,
      webRtcEnabled: row.webrtc_enabled === 1,
      webRtcUdpStart: row.webrtc_udp_start,
      webRtcUdpEnd: row.webrtc_udp_end,
      identityMintMaxLevel: row.identity_mint_max_level,
      identityMintConcurrency: row.identity_mint_concurrency,
      identityMintQueueDepth: row.identity_mint_queue_depth,
      relayConfigured: row.relay_configured === 1,
      relayEnabled: row.relay_enabled === 1,
      relayName: row.relay_name,
      relayHost: row.relay_host,
      relayPort: row.relay_port,
      relayTokenEncrypted: row.relay_token_encrypted,
      updatedAt: row.updated_at,
    };
  }

  recordConnectionTest(result: { protocol: TeamSpeakProtocol | null; latencyMs: number | null; error: string | null }): void {
    this.context.database
      .prepare(
        `UPDATE settings
       SET detected_protocol = ?, last_test_at = ?, last_test_latency_ms = ?, last_test_error = ?
       WHERE id = 1`,
      )
      .run(result.protocol, new Date().toISOString(), result.latencyMs, result.error);
  }

  clearConnectionTest(): void {
    this.context.database.exec(
      "UPDATE settings SET detected_protocol = NULL, last_test_at = NULL, last_test_latency_ms = NULL, last_test_error = NULL WHERE id = 1",
    );
  }

  write(settings: SettingsUpdate, now: string): void {
    this.context.database
      .prepare(
        `UPDATE settings SET
         site_name = ?, access_mode = ?, ts_host = ?, ts_port = ?,
         ts_password_encrypted = ?, webrtc_enabled = ?, webrtc_udp_start = ?,
         webrtc_udp_end = ?, identity_mint_max_level = ?, identity_mint_concurrency = ?,
         identity_mint_queue_depth = ?, relay_configured = ?, relay_enabled = ?, relay_name = ?,
         relay_host = ?, relay_port = ?, relay_token_encrypted = ?, updated_at = ?
       WHERE id = 1`,
      )
      .run(
        settings.siteName,
        settings.accessMode,
        settings.tsHost,
        settings.tsPort,
        settings.tsPasswordEncrypted,
        settings.webRtcEnabled ? 1 : 0,
        settings.webRtcUdpStart ?? DEFAULT_WEBRTC_UDP_PORT_RANGE[0],
        settings.webRtcUdpEnd ?? DEFAULT_WEBRTC_UDP_PORT_RANGE[1],
        settings.identityMintMaxLevel ?? DEFAULT_IDENTITY_MINT_POLICY.maxLevel,
        settings.identityMintConcurrency ?? DEFAULT_IDENTITY_MINT_POLICY.concurrency,
        settings.identityMintQueueDepth ?? DEFAULT_IDENTITY_MINT_POLICY.queueDepth,
        settings.relayConfigured ? 1 : 0,
        settings.relayEnabled ? 1 : 0,
        settings.relayName,
        settings.relayHost,
        settings.relayPort,
        settings.relayTokenEncrypted,
        now,
      );
    this.writeWelcomeTexts(settings.welcomeTexts ?? {});
  }

  private readWelcomeTexts(): Record<string, string> {
    const rows = this.context.database.prepare("SELECT language, text FROM welcome_texts ORDER BY language").all() as WelcomeTextRow[];
    return Object.fromEntries(rows.map((row) => [row.language, row.text]));
  }

  private writeWelcomeTexts(texts: Record<string, string>): void {
    this.context.database.exec("DELETE FROM welcome_texts");
    const insert = this.context.database.prepare("INSERT INTO welcome_texts (language, text) VALUES (?, ?)");
    for (const [language, text] of Object.entries(texts)) {
      if (text.trim()) insert.run(language, text);
    }
  }
}

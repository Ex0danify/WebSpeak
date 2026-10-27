import { DEFAULT_WEBRTC_UDP_PORT_RANGE } from "../../config/webrtcConfig.js";
import { DEFAULT_RETENTION_POLICY } from "../../config/retentionConfig.js";
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
      webRtcEnabled: row.webrtc_enabled === 1,
      webRtcUdpStart: row.webrtc_udp_start,
      webRtcUdpEnd: row.webrtc_udp_end,
      identityMintMaxLevel: row.identity_mint_max_level,
      identityMintConcurrency: row.identity_mint_concurrency,
      identityMintQueueDepth: row.identity_mint_queue_depth,
      retention: {
        eventLog: { days: row.event_log_retention_days, maxRows: row.event_log_max_rows },
        connections: { days: row.connection_retention_days, maxRows: row.connection_max_rows },
      },
      updatedAt: row.updated_at,
    };
  }

  write(settings: SettingsUpdate, now: string): void {
    const retention = settings.retention ?? DEFAULT_RETENTION_POLICY;
    this.context.database
      .prepare(
        `UPDATE settings SET
         site_name = ?, access_mode = ?, webrtc_enabled = ?, webrtc_udp_start = ?,
         webrtc_udp_end = ?, identity_mint_max_level = ?, identity_mint_concurrency = ?,
         identity_mint_queue_depth = ?, event_log_retention_days = ?, event_log_max_rows = ?,
         connection_retention_days = ?, connection_max_rows = ?, updated_at = ?
       WHERE id = 1`,
      )
      .run(
        settings.siteName,
        settings.accessMode,
        settings.webRtcEnabled ? 1 : 0,
        settings.webRtcUdpStart ?? DEFAULT_WEBRTC_UDP_PORT_RANGE[0],
        settings.webRtcUdpEnd ?? DEFAULT_WEBRTC_UDP_PORT_RANGE[1],
        settings.identityMintMaxLevel ?? DEFAULT_IDENTITY_MINT_POLICY.maxLevel,
        settings.identityMintConcurrency ?? DEFAULT_IDENTITY_MINT_POLICY.concurrency,
        settings.identityMintQueueDepth ?? DEFAULT_IDENTITY_MINT_POLICY.queueDepth,
        retention.eventLog.days,
        retention.eventLog.maxRows,
        retention.connections.days,
        retention.connections.maxRows,
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

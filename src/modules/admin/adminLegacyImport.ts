import { existsSync } from "node:fs";
import type { Logger } from "../../shared/logger.js";
import { loadConfig } from "../../config/appConfig.js";
import { WebSpeakDatabase } from "../../infra/persistence/database.js";
import { encryptSecret } from "../../infra/security/secretCrypto.js";

export function importLegacyConfigOnce(database: WebSpeakDatabase, legacyConfigPath: string, masterSecret: Buffer, logger: Logger): void {
  if (database.getMeta("legacy_config_checked") === "1") return;
  if (existsSync(legacyConfigPath)) {
    const legacy = loadConfig(legacyConfigPath);
    const current = database.getSettings();
    database.updateSettings({
      siteName: current.siteName,
      welcomeTexts: current.welcomeTexts,
      accessMode: current.accessMode,
      tsHost: legacy.tsHost,
      tsPort: legacy.tsPort,
      tsPasswordEncrypted: legacy.tsServerPassword ? encryptSecret(legacy.tsServerPassword, masterSecret) : null,
      webRtcEnabled: current.webRtcEnabled,
      webRtcUdpStart: current.webRtcUdpStart,
      webRtcUdpEnd: current.webRtcUdpEnd,
      relayConfigured: current.relayConfigured,
      relayEnabled: current.relayEnabled,
      relayName: current.relayName,
      relayHost: current.relayHost,
      relayPort: current.relayPort,
      relayTokenEncrypted: current.relayTokenEncrypted,
    }, "LEGACY_CONFIG_IMPORTED");
    database.setMeta("legacy_config_imported", "1");
    database.setMeta("legacy_import_notice_pending", "1");
    logger.info("Legacy config imported; WebSpeak settings are now managed from /admin");
  }
  database.setMeta("legacy_config_checked", "1");
}

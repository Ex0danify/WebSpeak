import type { AdminService } from "../../modules/admin/index.js";
import type { VoiceBridgeOptions } from "../../modules/voice/index.js";
import type { Logger } from "../../shared/logger.js";

export interface WebServerOptions {
  /** The address to listen on, undefined for all interfaces. */
  host?: string;
  port: number;
  version?: string;
  logFile?: string;
  staticDir?: string;
  certDir?: string; // path to cert.pem + key.pem for HTTPS
  voiceBridgeOptions: VoiceBridgeOptions;
  adminService: AdminService;
  logger: Logger;
  nextVisitorNumber?: () => number;
  visitorCount?: () => number;
}

import type { AdminService, GatewayEvents } from "../../modules/admin/index.js";
import type { VoiceBridgeOptions } from "../../modules/voice/index.js";
import type { Logger } from "../../shared/logger.js";

export interface WebServerOptions {
  /** The address to listen on, undefined for all interfaces. */
  host?: string;
  port: number;
  version?: string;
  staticDir?: string;
  certDir?: string; // path to cert.pem + key.pem for HTTPS
  /** Where the gateway log is written, the diagnostic bundle reads its tail from there. */
  logDir?: string;
  voiceBridgeOptions: VoiceBridgeOptions;
  adminService: AdminService;
  logger: Logger;
  gatewayEvents?: GatewayEvents;
  nextVisitorNumber?: () => number;
  visitorCount?: () => number;
}

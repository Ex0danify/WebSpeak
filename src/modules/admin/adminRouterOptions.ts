import type { Logger } from "../../shared/logger.js";
import type { AdminService } from "./adminService.js";
import type { AdminSessionStore } from "./adminSession.js";
import type { AdminSessionSummary } from "../voice/index.js";

export interface AdminRouterOptions {
  service: AdminService;
  sessions: AdminSessionStore;
  logger: Logger;
  getActiveSessions(): number;
  getPeakSessions(): number;
  getCreatedSessions?: () => number;
  getSessionSummaries?: () => AdminSessionSummary[];
  terminateSession?: (id: string) => Promise<boolean>;
  version?: string;
  logFile?: string;
  startedAt: number;
}

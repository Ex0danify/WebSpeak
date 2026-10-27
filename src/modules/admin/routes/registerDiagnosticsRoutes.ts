import type { Router } from "express";
import { MAX_ACTIVE_SESSIONS } from "../../../shared/constants.js";
import { resolveClientIp } from "../../../shared/http/clientIp.js";
import type { AdminOverview } from "../adminService.js";
import { sendAdminError } from "../adminMiddleware.js";
import { readAuditQuery } from "../adminAuditQuery.js";
import { readConnectionQuery } from "../adminConnectionQuery.js";
import type { AdminRouterOptions } from "../adminRouterOptions.js";

/** Overview, event log, connection history, diagnostics, the downloadable report and the database backup. */
export function registerDiagnosticsRoutes(router: Router, options: AdminRouterOptions): void {
  const overview = () => options.service.getOverview(options.getActiveSessions(), options.getPeakSessions(), options.startedAt);
  // The part of the diagnostics answer and of the report that is the same.
  const snapshot = (current: AdminOverview) => ({
    generatedAt: new Date().toISOString(),
    gateway: {
      version: options.version ?? "0.1.0",
      uptimeSeconds: current.gateway.uptimeSeconds,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    sessions: {
      active: options.getActiveSessions(),
      peak: options.getPeakSessions(),
      created: options.getCreatedSessions?.() ?? 0,
      limit: MAX_ACTIVE_SESSIONS,
    },
  });

  router.get("/overview", (_request, response) => {
    response.json(overview());
  });

  router.get("/audit", (request, response) => {
    try {
      response.json(options.service.database.listAudit(readAuditQuery(request.query)));
    } catch (error: unknown) {
      sendAdminError(response, error);
    }
  });

  router.get("/connections", (request, response) => {
    try {
      response.json(options.service.database.listConnections(readConnectionQuery(request.query)));
    } catch (error: unknown) {
      sendAdminError(response, error);
    }
  });

  router.get("/diagnostics", (_request, response) => {
    const current = overview();
    response.json({
      ...snapshot(current),
      servers: current.servers,
      database: { schemaVersion: options.service.database.schemaVersion },
    });
  });

  router.get("/diagnostics/report", (_request, response) => {
    const current = overview();
    const report = {
      ...snapshot(current),
      servers: current.servers.map(({ name, status, lastTestAt, latencyMs, lastError }) => ({
        name,
        status,
        lastTestAt,
        latencyMs,
        lastError,
      })),
      database: { schemaVersion: options.service.database.schemaVersion },
      audit: options.service.database.listAudit({ limit: 50, offset: 0 }).events,
      connections: options.service.database.recentConnections(50),
    };
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="webspeak-diagnostic-report.json"`);
    response.send(JSON.stringify(report, null, 2));
  });

  router.get("/backup", (request, response) => {
    try {
      const backup = options.service.database.exportBackup();
      options.service.database.addAudit("ADMIN_BACKUP_EXPORTED", { ip: resolveClientIp(request) });
      response.setHeader("Content-Type", "application/octet-stream");
      response.setHeader("Content-Disposition", `attachment; filename="webspeak-backup-${new Date().toISOString().slice(0, 10)}.db"`);
      response.send(backup);
    } catch {
      response.status(500).json({ ok: false, code: "BACKUP_FAILED" });
    }
  });
}

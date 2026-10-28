import type { Router } from "express";
import { MAX_ACTIVE_SESSIONS } from "../../../shared/constants.js";
import { resolveClientIp } from "../../../shared/http/clientIp.js";
import { sendAdminError } from "../adminMiddleware.js";
import { readAuditQuery } from "../adminAuditQuery.js";
import { readConnectionQuery } from "../adminConnectionQuery.js";
import type { AdminRouterOptions } from "../adminRouterOptions.js";
import { buildBundleFiles, zipBundle } from "../diagnostics/diagnosticBundle.js";

/** Overview, event log, connection history, diagnostics, the diagnostic bundle and the database backup. */
export function registerDiagnosticsRoutes(router: Router, options: AdminRouterOptions): void {
  const overview = () => options.service.getOverview(options.getActiveSessions(), options.getPeakSessions(), options.startedAt);
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
      servers: current.servers,
      database: { schemaVersion: options.service.database.schemaVersion },
    });
  });

  router.get("/diagnostics/bundle", (request, response) => {
    try {
      const version = options.version ?? "0.1.0";
      const files = buildBundleFiles({
        database: options.service.database,
        overview: overview(),
        version,
        runtime: options.runtime ?? { tls: false },
        liveSessions: options.getSessionSummaries?.() ?? [],
        createdSessions: options.getCreatedSessions?.() ?? 0,
        requester: { userAgent: request.headers["user-agent"], forwardedFor: Boolean(request.headers["x-forwarded-for"]) },
      });
      response.setHeader("Content-Type", "application/zip");
      response.setHeader(
        "Content-Disposition",
        `attachment; filename="webspeak-diagnostics-${version}-${new Date().toISOString().slice(0, 10)}.zip"`,
      );
      response.send(Buffer.from(zipBundle(files)));
    } catch (error: unknown) {
      options.logger.error({ err: error instanceof Error ? error.message : String(error) }, "Could not build the diagnostic bundle");
      response.status(500).json({ ok: false, code: "DIAGNOSTICS_FAILED" });
    }
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

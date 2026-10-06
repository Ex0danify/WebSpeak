import { existsSync } from "node:fs";
import type { Router } from "express";
import { readConnectionHistory, readRecentLogs } from "../adminLogReader.js";
import { readLimit } from "../adminRequestParsing.js";
import type { AdminRouterOptions } from "../adminRouterOptions.js";

interface AdminOverview {
  gateway: { uptimeSeconds: number };
  teamSpeak: {
    target: string;
    status: string;
    lastTestAt: string | null;
    latencyMs: number | null;
    lastError: string | null;
  };
}

/** Audit trail, log tail, diagnostics, the downloadable report and the database backup. */
export function registerDiagnosticsRoutes(router: Router, options: AdminRouterOptions): void {
  router.get("/audit", (request, response) => {
    response.json({ events: options.service.database.recentAudit(readLimit(request.query.limit, 50)) });
  });

  router.get("/logs", (request, response) => {
    const limit = readLimit(request.query.limit, 100);
    response.json({
      available: Boolean(options.logFile && existsSync(options.logFile)),
      entries: readRecentLogs(options.logFile, limit),
      sessions: readConnectionHistory(options.logFile, limit),
    });
  });

  router.get("/diagnostics", (_request, response) => {
    const overview = options.service.getOverview(
      options.getActiveSessions(),
      options.getPeakSessions(),
      options.startedAt,
    ) as unknown as AdminOverview;
    response.json({
      generatedAt: new Date().toISOString(),
      gateway: {
        version: options.version ?? "0.1.0",
        uptimeSeconds: overview.gateway.uptimeSeconds,
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      sessions: {
        active: options.getActiveSessions(),
        peak: options.getPeakSessions(),
        created: options.getCreatedSessions?.() ?? 0,
        limit: 100,
      },
      teamSpeak: overview.teamSpeak,
      database: { schemaVersion: options.service.database.schemaVersion },
      logs: { available: Boolean(options.logFile && existsSync(options.logFile)) },
    });
  });

  router.get("/diagnostics/report", (_request, response) => {
    const overview = options.service.getOverview(
      options.getActiveSessions(),
      options.getPeakSessions(),
      options.startedAt,
    ) as unknown as AdminOverview;
    const report = {
      generatedAt: new Date().toISOString(),
      gateway: {
        version: options.version ?? "0.1.0",
        uptimeSeconds: overview.gateway.uptimeSeconds,
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      sessions: {
        active: options.getActiveSessions(),
        peak: options.getPeakSessions(),
        created: options.getCreatedSessions?.() ?? 0,
        limit: 100,
      },
      teamSpeak: {
        status: overview.teamSpeak.status,
        lastTestAt: overview.teamSpeak.lastTestAt,
        latencyMs: overview.teamSpeak.latencyMs,
        lastError: overview.teamSpeak.lastError,
      },
      database: { schemaVersion: options.service.database.schemaVersion },
      audit: options.service.database.recentAudit(50),
    };
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="webspeak-diagnostic-report.json"`);
    response.send(JSON.stringify(report, null, 2));
  });

  router.get("/backup", (_request, response) => {
    try {
      const backup = options.service.database.exportBackup();
      options.service.database.addAudit("ADMIN_BACKUP_EXPORTED");
      response.setHeader("Content-Type", "application/octet-stream");
      response.setHeader("Content-Disposition", `attachment; filename="webspeak-backup-${new Date().toISOString().slice(0, 10)}.db"`);
      response.send(backup);
    } catch {
      response.status(500).json({ ok: false, code: "BACKUP_FAILED" });
    }
  });
}

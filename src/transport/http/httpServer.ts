import express from "express";
import { createServer as createHttpsServer } from "node:https";
import { createServer as createHttpServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { VoiceBridge } from "../../modules/voice/index.js";
import { createAdminRouter } from "../../modules/admin/index.js";
import { AdminSessionStore } from "../../modules/admin/index.js";
import { JoinRateLimiter, ServerPasswordBackoff } from "../../modules/join/index.js";
import type { WebServerOptions } from "./webServerOptions.js";
import { registerJoinRoutes } from "./routes/registerJoinRoutes.js";
import { registerIdentityRoutes } from "./routes/registerIdentityRoutes.js";
import { IdentityMintQueue } from "../../modules/identity/index.js";
import { securityHeaders } from "./securityHeaders.js";
import { registerPublicRoutes } from "./routes/registerPublicRoutes.js";

export type { WebServerOptions } from "./webServerOptions.js";

export interface WebServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createWebServer(options: WebServerOptions): WebServer {
  const app = express();
  app.disable("x-powered-by");
  app.use(securityHeaders(options.staticDir));
  const logger = options.logger.child({ component: "web" });

  let server: ReturnType<typeof createHttpsServer> | ReturnType<typeof createHttpServer>;

  if (options.certDir) {
    const cert = readFileSync(path.join(options.certDir, "cert.pem"));
    const key = readFileSync(path.join(options.certDir, "key.pem"));
    server = createHttpsServer({ cert, key }, app);
    logger.info("HTTPS enabled");
  } else {
    server = createHttpServer(app);
  }

  app.use(express.json({ limit: "100kb" }));

  const voiceBridge = new VoiceBridge(options.voiceBridgeOptions, logger);
  const adminSessions = new AdminSessionStore(() => options.adminService.database.getAdminSessionEpoch());
  const joinRateLimiter = new JoinRateLimiter();
  const passwordBackoff = new ServerPasswordBackoff();
  // A separate limiter keeps mint floods from draining the join budget and vice versa.
  const identityRateLimiter = new JoinRateLimiter();
  const identityMintQueue = new IdentityMintQueue(() => options.adminService.getIdentityMintPolicy());
  const startedAt = Date.now();

  registerPublicRoutes(app, options, logger);
  registerJoinRoutes(app, options, joinRateLimiter, passwordBackoff);
  registerIdentityRoutes(app, options, identityRateLimiter, identityMintQueue, (key) => voiceBridge.isIdentityLeased(key));

  app.use(
    "/api/admin",
    createAdminRouter({
      service: options.adminService,
      sessions: adminSessions,
      logger,
      getActiveSessions: () => voiceBridge.getActiveCount(),
      getPeakSessions: () => voiceBridge.getPeakCount(),
      getCreatedSessions: () => voiceBridge.getCreatedCount(),
      getSessionSummaries: () => voiceBridge.getSessionSummaries(),
      terminateSession: (id) => voiceBridge.terminateSession(id),
      version: options.version,
      logFile: options.logFile,
      startedAt,
    }),
  );

  // Every other answer of the API is JSON, so an unknown path is too.
  app.use("/api", (_request, response) => {
    response.status(404).json({ ok: false, code: "NOT_FOUND" });
  });

  if (options.staticDir) {
    app.use(express.static(options.staticDir));
    app.get(/^(?!\/api|\/ws)/, (_req, res) => {
      res.sendFile(path.join(options.staticDir!, "index.html"));
    });
  }

  // Errors of the body parser (and anything else that reaches Express) answer with JSON and never
  // with the default page, which carries the stack trace outside production.
  app.use(((error: unknown, _request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    const failure = error as { status?: unknown; type?: unknown };
    if (failure.type === "entity.too.large") {
      response.status(413).json({ ok: false, code: "PAYLOAD_TOO_LARGE" });
    } else if (
      failure.type === "entity.parse.failed" ||
      failure.type === "encoding.unsupported" ||
      failure.type === "charset.unsupported"
    ) {
      response.status(400).json({ ok: false, code: "INVALID_JSON" });
    } else {
      logger.error({ err: error instanceof Error ? error.message : String(error) }, "Unhandled request error");
      response.status(500).json({ ok: false, code: "INTERNAL_ERROR" });
    }
  }) as express.ErrorRequestHandler);

  voiceBridge.attach(server);

  return {
    start(): Promise<void> {
      return new Promise((resolve) => {
        server.listen(options.port, options.host, () => {
          logger.info({ host: options.host ?? "all interfaces", port: options.port }, "Web server started");
          resolve();
        });
      });
    },
    async stop(): Promise<void> {
      await voiceBridge.shutdown();
      adminSessions.clear();
      return new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    },
  };
}

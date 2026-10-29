import type { Router } from "express";
import { resolveClientIp } from "../../../shared/http/clientIp.js";
import { requireCsrf, requireSameOrigin } from "../adminMiddleware.js";
import type { AdminRouterOptions } from "../adminRouterOptions.js";

/** Live voice sessions (list, terminate). */
export function registerSessionRoutes(router: Router, options: AdminRouterOptions): void {
  router.get("/sessions", (_request, response) => {
    response.json({ sessions: options.getSessionSummaries?.() ?? [] });
  });

  router.post("/sessions/:id/terminate", requireSameOrigin, requireCsrf(options.sessions), async (request, response) => {
    const id = typeof request.params.id === "string" ? request.params.id : "";
    const session = options.getSessionSummaries?.().find((candidate) => candidate.id === id);
    if (!options.terminateSession || !id || !(await options.terminateSession(id))) {
      response.status(404).json({ ok: false, code: "SESSION_NOT_FOUND" });
      return;
    }
    options.service.database.addAudit("ADMIN_SESSION_TERMINATED", {
      id,
      nickname: session?.nickname,
      target: session?.target,
      ip: resolveClientIp(request),
    });
    response.json({ ok: true });
  });
}

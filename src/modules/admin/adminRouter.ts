import { type NextFunction, type Request, type Response, Router } from "express";
import { requireAdmin, sendAdminError } from "./adminMiddleware.js";
import type { AdminRouterOptions } from "./adminRouterOptions.js";
import { AdminLoginRateLimiter } from "./loginRateLimit.js";
import { registerAuthRoutes } from "./routes/registerAuthRoutes.js";
import { registerDiagnosticsRoutes } from "./routes/registerDiagnosticsRoutes.js";
import { registerInviteRoutes } from "./routes/registerInviteRoutes.js";
import { registerServerRoutes } from "./routes/registerServerRoutes.js";
import { registerSessionRoutes } from "./routes/registerSessionRoutes.js";

export type { AdminRouterOptions } from "./adminRouterOptions.js";

export function createAdminRouter(options: AdminRouterOptions): Router {
  const router = Router();
  const limiter = new AdminLoginRateLimiter();
  const logger = options.logger.child({ component: "admin-api" });

  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });

  registerAuthRoutes(router, options, limiter, logger);

  // Everything below needs a session, keep this guard between the public and the admin routes.
  router.use(requireAdmin(options.sessions, options.service));

  registerSessionRoutes(router, options);
  registerInviteRoutes(router, options);
  registerDiagnosticsRoutes(router, options);
  registerServerRoutes(router, options);

  router.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    sendAdminError(response, error);
  });

  return router;
}

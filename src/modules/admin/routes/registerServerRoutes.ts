import type { Response, Router } from "express";
import { requireCsrf, requireSameOrigin, sendAdminError } from "../adminMiddleware.js";
import { asRecord, readSettingsInput, readString } from "../adminRequestParsing.js";
import type { AdminRouterOptions } from "../adminRouterOptions.js";
import type { AdminService } from "../adminService.js";
import { TeamSpeakProbeError } from "../../teamspeak/index.js";

/** TeamSpeak target settings, and the connection test. */
export function registerServerRoutes(router: Router, options: AdminRouterOptions): void {
  router.get("/server", (_request, response) => {
    response.json(options.service.getAdminSettings());
  });

  router.put("/server", requireSameOrigin, requireCsrf(options.sessions), (request, response) => {
    try {
      options.service.updateSettings(readSettingsInput(asRecord(request.body)));
      response.json({ ok: true, settings: options.service.getAdminSettings() });
    } catch (error: unknown) {
      sendAdminError(response, error);
    }
  });

  // The test only sends the first handshake packets and logs no client in, so the request carries
  // just the target and no server password.
  router.post("/server/test", requireSameOrigin, requireCsrf(options.sessions), async (request, response) => {
    await runProbe(options.service, response, readString(asRecord(request.body), "target", 300), true);
  });
}

async function runProbe(service: AdminService, response: Response, target: string, persistResult: boolean): Promise<void> {
  try {
    response.json(await service.testConnection(target, persistResult));
  } catch (error: unknown) {
    if (error instanceof TeamSpeakProbeError) {
      response.status(400).json({ ok: false, code: error.code });
      return;
    }
    sendAdminError(response, error);
  }
}

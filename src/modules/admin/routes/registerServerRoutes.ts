import type { Response, Router } from "express";
import { requireCsrf, requireSameOrigin, sendAdminError } from "../adminMiddleware.js";
import { asRecord, readServerInput, readSettingsInput, readString } from "../adminRequestParsing.js";
import type { AdminRouterOptions } from "../adminRouterOptions.js";
import { AdminInputError } from "../adminService.js";
import { TeamSpeakProbeError } from "../../teamspeak/index.js";

/** Gateway settings, the TeamSpeak server list and its connection tests. */
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
  // just the target and no server password. Nothing is kept, the dialog tests values that are not saved yet.
  router.post("/server/test", requireSameOrigin, requireCsrf(options.sessions), async (request, response) => {
    await runProbe(response, () => options.service.testConnection(readString(asRecord(request.body), "target", 300)));
  });

  router.get("/servers", (_request, response) => {
    response.json({ servers: options.service.listServers() });
  });

  router.post("/servers", requireSameOrigin, requireCsrf(options.sessions), (request, response) => {
    try {
      const server = options.service.createServer(readServerInput(asRecord(request.body)));
      response.status(201).json({ ok: true, server, servers: options.service.listServers() });
    } catch (error: unknown) {
      sendAdminError(response, error);
    }
  });

  // Before `/servers/:id`, which would take "order" for an id.
  router.put("/servers/order", requireSameOrigin, requireCsrf(options.sessions), (request, response) => {
    try {
      options.service.reorderServers(asRecord(request.body).ids);
      response.json({ ok: true, servers: options.service.listServers() });
    } catch (error: unknown) {
      sendAdminError(response, error);
    }
  });

  router.put("/servers/:id", requireSameOrigin, requireCsrf(options.sessions), (request, response) => {
    try {
      const server = options.service.updateServer(readServerId(request.params.id), readServerInput(asRecord(request.body)));
      response.json({ ok: true, server, servers: options.service.listServers() });
    } catch (error: unknown) {
      sendAdminError(response, error);
    }
  });

  router.delete("/servers/:id", requireSameOrigin, requireCsrf(options.sessions), (request, response) => {
    try {
      options.service.removeServer(readServerId(request.params.id));
      response.json({ ok: true, servers: options.service.listServers() });
    } catch (error: unknown) {
      sendAdminError(response, error);
    }
  });

  router.post("/servers/:id/test", requireSameOrigin, requireCsrf(options.sessions), async (request, response) => {
    await runProbe(response, () => options.service.testServer(readServerId(request.params.id)));
  });
}

function readServerId(value: unknown): string {
  if (typeof value !== "string" || !/^server-[a-z0-9-]{1,100}$/i.test(value))
    throw new AdminInputError("SERVER_NOT_FOUND", "Server not found");
  return value;
}

async function runProbe(response: Response, test: () => Promise<unknown>): Promise<void> {
  try {
    response.json(await test());
  } catch (error: unknown) {
    if (error instanceof TeamSpeakProbeError) {
      response.status(400).json({ ok: false, code: error.code });
      return;
    }
    sendAdminError(response, error);
  }
}

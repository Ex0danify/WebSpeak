import type { Router } from "express";
import { requireCsrf, requireSameOrigin, sendAdminError } from "../adminMiddleware.js";
import { asRecord, readOptionalNumber, readOptionalString } from "../adminRequestParsing.js";
import type { AdminRouterOptions } from "../adminRouterOptions.js";
import { INVITE_PAGE_MAX, INVITE_STATUSES } from "../adminInviteService.js";
import { AdminInputError, type ManagedInviteQuery } from "../adminService.js";

const INVITE_PAGE_DEFAULT = 25;

function readInviteQuery(query: Record<string, unknown>): ManagedInviteQuery {
  const limit = query.limit === undefined ? INVITE_PAGE_DEFAULT : Number(query.limit);
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > INVITE_PAGE_MAX || !Number.isInteger(offset) || offset < 0) {
    throw new AdminInputError("INVALID_INVITE_QUERY", "Invite paging is invalid");
  }
  if (query.status === undefined) return { limit, offset };
  const status = INVITE_STATUSES.find((candidate) => candidate === query.status);
  if (!status) throw new AdminInputError("INVALID_INVITE_QUERY", "Invite status is invalid");
  return { limit, offset, status };
}

export function registerInviteRoutes(router: Router, options: AdminRouterOptions): void {
  router.get("/invites", (request, response) => {
    try {
      response.json(options.service.listManagedInvites(readInviteQuery(request.query)));
    } catch (error: unknown) {
      sendAdminError(response, error);
    }
  });

  router.post("/invites", requireSameOrigin, requireCsrf(options.sessions), (request, response) => {
    try {
      const body = asRecord(request.body);
      const created = options.service.createManagedInvite({
        serverId: readOptionalString(body, "serverId", 100),
        channel: readOptionalString(body, "channel", 100),
        expiresInHours: readOptionalNumber(body, "expiresInHours", 1),
        maxUses: readOptionalNumber(body, "maxUses", 0),
      });
      response.status(201).json({ ok: true, ...created });
    } catch (error: unknown) {
      sendAdminError(response, error);
    }
  });

  router.post("/invites/:id/revoke", requireSameOrigin, requireCsrf(options.sessions), (request, response) => {
    try {
      const id = typeof request.params.id === "string" ? request.params.id : "";
      if (!id) throw new AdminInputError("INVALID_INVITE_ID", "Invite id is invalid");
      if (!options.service.revokeManagedInvite(id)) {
        response.status(404).json({ ok: false, code: "INVITE_NOT_FOUND" });
        return;
      }
      response.json({ ok: true });
    } catch (error: unknown) {
      sendAdminError(response, error);
    }
  });
}

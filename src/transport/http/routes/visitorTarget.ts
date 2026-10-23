import { resolveSafeOpenTarget } from "../../../infra/security/openTargetPolicy.js";
import type { AdminService } from "../../../modules/admin/index.js";
import { parseTeamSpeakTarget, type TeamSpeakTarget } from "../../../shared/teamSpeakTarget.js";

export class TargetNotAllowedError extends Error {}

export interface VisitorTarget {
  target: TeamSpeakTarget;
  /** The saved password of a configured server, empty for a typed address. */
  serverPassword: string;
  /** Picked from the server list, which is the administrator's trust decision. A typed address is not. */
  listed: boolean;
}

/**
 * The server a visitor asked for. A configured server is trusted as saved, even on a loopback or LAN address. Only
 * open access takes a typed address, and that one always passes the guard against internal targets.
 */
export async function resolveVisitorTarget(adminService: AdminService, body: Record<string, unknown>): Promise<VisitorTarget> {
  if (typeof body.serverId === "string" && body.serverId) {
    const server = adminService.resolveServer(body.serverId.slice(0, 110));
    if (!server) throw new TargetNotAllowedError();
    return { target: server.target, serverPassword: server.serverPassword, listed: true };
  }
  if (adminService.getAccessMode() === "open" && typeof body.target === "string" && body.target.trim()) {
    return { target: await resolveSafeOpenTarget(parseTeamSpeakTarget(body.target)), serverPassword: "", listed: false };
  }
  throw new TargetNotAllowedError();
}

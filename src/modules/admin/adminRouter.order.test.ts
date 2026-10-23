import { describe, expect, it } from "vitest";
import { stubLogger } from "../../../test/support/adminService.js";
import { createAdminRouter } from "./adminRouter.js";
import type { AdminService } from "./adminService.js";
import type { AdminSessionStore } from "./adminSession.js";

interface RouterLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

function layers(): string[] {
  const router = createAdminRouter({
    service: {} as AdminService,
    sessions: {} as AdminSessionStore,
    logger: stubLogger(),
    getActiveSessions: () => 0,
    getPeakSessions: () => 0,
    startedAt: 0,
  });
  return (router as unknown as { stack: RouterLayer[] }).stack.map((layer) =>
    layer.route ? `${Object.keys(layer.route.methods).join(",").toUpperCase()} ${layer.route.path}` : "use",
  );
}

describe("admin router layer order", () => {
  const stack = layers();
  const guard = stack.indexOf("use", 1);

  it("starts with the no-store header and ends with the error handler", () => {
    expect(stack[0]).toBe("use");
    expect(stack.at(-1)).toBe("use");
  });

  it("serves the public routes in order, before the administrator guard", () => {
    expect(stack.slice(1, guard)).toEqual(["GET /status", "GET /session", "POST /login", "POST /change-password", "POST /logout"]);
  });

  it("puts every administrator route behind the guard", () => {
    // Paths are distinct, so the order inside the guarded part does not change which handler matches.
    expect(stack.slice(guard + 1, -1).sort()).toEqual(
      [
        "GET /audit",
        "GET /backup",
        "GET /diagnostics",
        "GET /diagnostics/report",
        "GET /invites",
        "GET /logs",
        "GET /overview",
        "GET /server",
        "GET /servers",
        "GET /sessions",
        "POST /invites",
        "POST /invites/:id/revoke",
        "POST /server/test",
        "POST /servers",
        "POST /servers/:id/test",
        "POST /sessions/:id/terminate",
        "PUT /server",
        "PUT /servers/:id",
        "PUT /servers/order",
        "DELETE /servers/:id",
      ].sort(),
    );
    expect(stack).toHaveLength(guard + 1 + 20 + 1);
  });
});

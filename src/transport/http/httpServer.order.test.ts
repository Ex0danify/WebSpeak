import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stubLogger } from "../../../test/support/adminService.js";
import { JoinTicketStore } from "../../modules/join/index.js";
import type { AdminService } from "../../modules/admin/index.js";

const captured = vi.hoisted(() => ({ app: undefined as unknown }));

vi.mock("node:http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:http")>();
  return {
    ...actual,
    default: actual,
    createServer: ((...args: unknown[]) => {
      captured.app = args[0];
      return (actual.createServer as (...a: unknown[]) => unknown)(...args);
    }) as typeof actual.createServer,
  };
});

const { createWebServer } = await import("./httpServer.js");

interface AppLayer {
  name: string;
  route?: { path: string; methods: Record<string, boolean> };
  matchers?: unknown;
  path?: string;
  regexp?: RegExp;
}

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function stackOf(staticDir?: string): string[] {
  captured.app = undefined;
  createWebServer({
    port: 0,
    staticDir,
    voiceBridgeOptions: { joinTickets: new JoinTicketStore() },
    adminService: {} as AdminService,
    logger: stubLogger(),
  });
  const app = captured.app as { router: { stack: AppLayer[] } };
  return app.router.stack.map((layer) => {
    if (layer.route) return `${Object.keys(layer.route.methods).join(",").toUpperCase()} ${String(layer.route.path)}`;
    return `use ${layer.name} ${layer.regexp?.source ?? ""}`.trim();
  });
}

describe("web server layer order", () => {
  it("registers body parser, public routes, join ticket, admin mount, API 404, static, SPA fallback, error handler in that order", () => {
    const dir = mkdtempSync(join(tmpdir(), "webspeak-static-"));
    dirs.push(dir);
    writeFileSync(join(dir, "index.html"), "<html></html>");
    const stack = stackOf(dir);
    expect(stack).toMatchInlineSnapshot(`
      [
        "use <anonymous>",
        "use jsonParser",
        "GET /health",
        "GET /api/health",
        "GET /api/public-config",
        "POST /api/join-ticket",
        "use router",
        "use <anonymous>",
        "use serveStatic",
        "GET /^(?!\\/api|\\/ws)/",
        "use <anonymous>",
      ]
    `);
  });

  it("leaves out the static layers without a staticDir and still ends with the error handler", () => {
    const stack = stackOf();
    expect(stack).toMatchInlineSnapshot(`
      [
        "use <anonymous>",
        "use jsonParser",
        "GET /health",
        "GET /api/health",
        "GET /api/public-config",
        "POST /api/join-ticket",
        "use router",
        "use <anonymous>",
        "use <anonymous>",
      ]
    `);
  });
});

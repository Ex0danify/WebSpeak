import { afterEach, describe, expect, it, vi } from "vitest";
import { stubLogger } from "../../test/helpers/admin-service.js";
import { type Gateway, TEST_ADMIN_PASSWORD, useGateway } from "../../test/helpers/gateway.js";
import { createAdminRouter } from "./admin-router.js";
import { AdminSessionStore } from "./admin-session.js";

// The real limiter runs, only its wait (250 ms up to 2 s after each failure) is skipped and recorded.
const waits = vi.hoisted(() => [] as number[]);
vi.mock("./login-rate-limit.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./login-rate-limit.js")>(),
  waitFor: (ms: number) => { waits.push(ms); return Promise.resolve(); },
}));

const gateways = useGateway();
const JSON_HEADERS = { "content-type": "application/json" };
const HOUR_MS = 60 * 60 * 1000;
const WINDOW_MS = 5 * 60 * 1000;

afterEach(() => {
  vi.useRealTimers();
  waits.length = 0;
});

async function login(gateway: Gateway, body: unknown) {
  const response = await gateway.request("/api/admin/login", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
  return { response, body: await response.json() as Record<string, unknown> };
}

const audit = (gateway: Gateway) => gateway.database.recentAudit(50).map((row) => row.event);

describe("status and session", () => {
  it("reports whether the gateway is set up, without a session, and never caches", async () => {
    const gateway = await gateways.start();
    const status = await gateway.request("/api/admin/status");
    expect(await status.json()).toEqual({ initialized: true });
    expect(status.headers.get("cache-control")).toBe("no-store");
    const empty = await gateways.start({ initialize: false });
    expect(await (await empty.request("/api/admin/status")).json()).toEqual({ initialized: false });
  });

  it("describes an anonymous visitor and a logged-in administrator", async () => {
    const gateway = await gateways.start();
    expect(await (await gateway.request("/api/admin/session")).json()).toEqual({ initialized: true, authenticated: false, mustChangePassword: false });
    const admin = await gateway.adminLogin();
    const session = await (await admin.get("session")).json() as Record<string, unknown>;
    expect(session).toMatchObject({ initialized: true, authenticated: true, mustChangePassword: false, csrfToken: admin.csrfToken });
    expect(session.expiresAt as number - Date.now()).toBeGreaterThan(12 * HOUR_MS - 60_000);
    expect(session.expiresAt as number - Date.now()).toBeLessThanOrEqual(12 * HOUR_MS);
  });

  it("ends a session after 12 hours", async () => {
    const gateway = await gateways.start();
    const admin = await gateway.adminLogin();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 12 * HOUR_MS + 1000);
    expect(await (await admin.get("overview")).json()).toEqual({ ok: false, code: "AUTH_REQUIRED" });
    expect(await (await admin.get("session")).json()).toMatchObject({ authenticated: false });
  });
});

describe("login", () => {
  it("answers with a CSRF token and a strict, http-only session cookie, and audits it", async () => {
    const gateway = await gateways.start();
    const { response, body } = await login(gateway, { username: "admin", password: TEST_ADMIN_PASSWORD });
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, csrfToken: expect.any(String), mustChangePassword: false });
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^webspeak_admin=[\w-]{40,}; Max-Age=43200; Path=\/; Expires=.+; HttpOnly; SameSite=Strict$/);
    expect(audit(gateway)[0]).toBe("ADMIN_LOGIN_SUCCEEDED");
  });

  it("refuses a wrong password or user name with 401 INVALID_PASSWORD, no cookie, and audits it", async () => {
    const gateway = await gateways.start();
    for (const credentials of [{ username: "admin", password: "wrong" }, { username: "root", password: TEST_ADMIN_PASSWORD }, { username: "admin" }]) {
      const { response, body } = await login(gateway, credentials);
      expect(response.status, JSON.stringify(credentials)).toBe(401);
      expect(body).toEqual({ ok: false, code: "INVALID_PASSWORD" });
      expect(response.headers.get("set-cookie")).toBeNull();
    }
    expect(audit(gateway).slice(0, 3)).toEqual(["ADMIN_LOGIN_FAILED", "ADMIN_LOGIN_FAILED", "ADMIN_LOGIN_FAILED"]);
  });

  it("refuses a malformed body with 400 INVALID_REQUEST, a non-JSON one with 415, another origin with 403, and an unset-up gateway with 409", async () => {
    const gateway = await gateways.start();
    for (const body of [{}, { username: 5, password: "x" }, [1]]) {
      expect(await login(gateway, body), JSON.stringify(body)).toMatchObject({ response: { status: 400 }, body: { ok: false, code: "INVALID_REQUEST" } });
    }
    const text = await gateway.request("/api/admin/login", { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" });
    expect([text.status, (await text.json() as { code: string }).code]).toEqual([415, "JSON_REQUIRED"]);
    const foreign = await gateway.request("/api/admin/login", { method: "POST", headers: { ...JSON_HEADERS, origin: "https://evil.example" }, body: "{}" });
    expect([foreign.status, (await foreign.json() as { code: string }).code]).toEqual([403, "ORIGIN_REJECTED"]);
    const empty = await gateways.start({ initialize: false });
    expect(await login(empty, { username: "admin", password: "admin" })).toMatchObject({ response: { status: 409 }, body: { code: "NOT_INITIALIZED" } });
  });

  it("waits longer after each failure (250, 500, 1000, 2000, 2000 ms)", async () => {
    const gateway = await gateways.start();
    for (let i = 0; i < 5; i++) await login(gateway, { username: "admin", password: "wrong" });
    expect(waits).toEqual([250, 500, 1000, 2000, 2000]);
  });
});

describe("login lockout", () => {
  const fail = async (gateway: Gateway, times: number) => { for (let i = 0; i < times; i++) await login(gateway, { username: "admin", password: "wrong" }); };

  it("locks the peer out after 5 failures, even for the right password, and says for how long", async () => {
    const gateway = await gateways.start();
    await fail(gateway, 5);
    const { response, body } = await login(gateway, { username: "admin", password: TEST_ADMIN_PASSWORD });
    expect(response.status).toBe(429);
    expect(body).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    expect(body.retryAfterMs as number).toBeGreaterThan(WINDOW_MS - 5000);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThanOrEqual(295);
    expect(Number(response.headers.get("retry-after"))).toBeLessThanOrEqual(300);
  });

  it("lets the peer in again after 5 minutes", async () => {
    const gateway = await gateways.start();
    await fail(gateway, 5);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + WINDOW_MS + 1000);
    expect((await login(gateway, { username: "admin", password: TEST_ADMIN_PASSWORD })).response.status).toBe(200);
  });

  it("forgets earlier failures after a successful login", async () => {
    const gateway = await gateways.start();
    await fail(gateway, 4);
    expect((await login(gateway, { username: "admin", password: TEST_ADMIN_PASSWORD })).response.status).toBe(200);
    await fail(gateway, 4);
    expect((await login(gateway, { username: "admin", password: TEST_ADMIN_PASSWORD })).response.status).toBe(200);
  });
});

describe("first-run password change", () => {
  it("logs in with the default account, blocks every admin route until the password is changed, then opens them", async () => {
    const gateway = await gateways.start({ forcePasswordChange: true });
    const admin = await gateway.adminLogin("admin");
    expect(admin.mustChangePassword).toBe(true);
    expect(await (await admin.get("session")).json()).toMatchObject({ authenticated: true, mustChangePassword: true });
    for (const path of ["overview", "server", "sessions", "invites", "audit", "logs", "diagnostics", "diagnostics/report", "backup"]) {
      const response = await admin.get(path);
      expect([response.status, (await response.json() as { code: string }).code], path).toEqual([403, "PASSWORD_CHANGE_REQUIRED"]);
    }
    expect((await admin.put("server", {})).status).toBe(403);

    const weak = await admin.post("change-password", { newPassword: "short" });
    expect([weak.status, (await weak.json() as { code: string }).code]).toEqual([400, "INVALID_ADMIN_PASSWORD"]);
    expect((await admin.get("overview")).status).toBe(403);

    const changed = await admin.post("change-password", { newPassword: "a brand new password 1" });
    expect(await changed.json()).toEqual({ ok: true, mustChangePassword: false });
    expect((await admin.get("overview")).status).toBe(200);
    expect(await login(gateway, { username: "admin", password: "admin" })).toMatchObject({ response: { status: 401 } });
    expect(await login(gateway, { username: "admin", password: "a brand new password 1" })).toMatchObject({ response: { status: 200 }, body: { mustChangePassword: false } });
  });
});

describe("logout", () => {
  it("ends the session, clears the cookie and audits it", async () => {
    const gateway = await gateways.start();
    const admin = await gateway.adminLogin();
    const response = await admin.post("logout");
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("set-cookie")).toMatch(/^webspeak_admin=; Path=\/; Expires=Thu, 01 Jan 1970/);
    expect((await admin.get("overview")).status).toBe(401);
    expect(audit(gateway)[0]).toBe("ADMIN_LOGOUT");
  });
});

describe("every mutating admin route needs the same origin, JSON and the CSRF token", () => {
  // `admin` routes sit behind the session check; the two others check the CSRF token themselves.
  const ROUTES = [
    { method: "POST", path: "/change-password", guard: "csrf" },
    { method: "POST", path: "/logout", guard: "csrf" },
    { method: "POST", path: "/sessions/:id/terminate", guard: "admin" },
    { method: "POST", path: "/invites", guard: "admin" },
    { method: "POST", path: "/invites/:id/revoke", guard: "admin" },
    { method: "PUT", path: "/server", guard: "admin" },
    { method: "POST", path: "/server/test", guard: "admin" },
    { method: "POST", path: "/legacy-import/dismiss", guard: "admin" },
  ] as const;

  it("has a row in this table for every POST and PUT route of the router, and for none that does not exist", async () => {
    const gateway = await gateways.start();
    const router = createAdminRouter({ service: gateway.adminService, sessions: new AdminSessionStore(), logger: stubLogger(), getActiveSessions: () => 0, getPeakSessions: () => 0, startedAt: Date.now() });
    const layers = (router as unknown as { stack: { route?: { path: string; methods: Record<string, boolean> } }[] }).stack;
    const found = layers.flatMap((layer) => layer.route ? Object.keys(layer.route.methods).map((method) => `${method.toUpperCase()} ${layer.route!.path}`) : [])
      .filter((route) => /^(POST|PUT|PATCH|DELETE) /.test(route) && route !== "POST /login");
    expect(found.sort()).toEqual(ROUTES.map((route) => `${route.method} ${route.path}`).sort());
  });

  it("rejects each of them without a session, without the token, with a wrong token, from another origin and without JSON", async () => {
    const gateway = await gateways.start();
    const admin = await gateway.adminLogin();
    const send = (route: (typeof ROUTES)[number], headers: Record<string, string>, useOrigin = true) => {
      const path = `/api/admin${route.path.replace(":id", "x")}`;
      const init = { method: route.method, body: "{}", headers: { "content-type": "application/json", ...headers } };
      return useOrigin ? gateway.request(path, init) : fetch(gateway.url + path, init);
    };
    const codeOf = async (response: Response) => [response.status, (await response.json() as { code: string }).code];
    for (const route of ROUTES) {
      const label = `${route.method} ${route.path}`;
      expect(await codeOf(await send(route, {})), `${label} without a session`).toEqual(route.guard === "admin" ? [401, "AUTH_REQUIRED"] : [403, "CSRF_REJECTED"]);
      expect(await codeOf(await send(route, { cookie: admin.cookie })), `${label} without the token`).toEqual([403, "CSRF_REJECTED"]);
      expect(await codeOf(await send(route, { cookie: admin.cookie, "x-csrf-token": "wrong" })), `${label} with a wrong token`).toEqual([403, "CSRF_REJECTED"]);
      const good = { cookie: admin.cookie, "x-csrf-token": admin.csrfToken };
      expect(await codeOf(await send(route, { ...good, origin: "https://evil.example" })), `${label} from another origin`).toEqual([403, "ORIGIN_REJECTED"]);
      expect(await codeOf(await send(route, good, false)), `${label} without an origin`).toEqual([403, "ORIGIN_REJECTED"]);
      expect(await codeOf(await send(route, { ...good, "content-type": "text/plain" })), `${label} without JSON`).toEqual([415, "JSON_REQUIRED"]);
    }
    expect((await admin.get("overview")).status, "none of the rejected requests changed the session").toBe(200);
  });
});

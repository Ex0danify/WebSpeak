import { createApp } from "vue";
import { registerAdminStores } from "./adminStores";
import { createPinia } from "pinia";
import { routeLocationKey, routerKey } from "vue-router";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { useAdminOperationsStore } from "./adminOperations";
import { useAdminOverviewStore } from "./adminOverview";
import { useAdminServerSettingsStore } from "./adminServerSettings";
import { useAdminSessionStore } from "./adminSession";

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function setup(path = "/admin") {
  const route = { path } as any;
  const router = {
    replace: vi.fn(async (to: string) => {
      route.path = to;
    }),
  } as any;
  const app = createApp({});
  const pinia = createPinia();
  app.use(pinia);
  registerAdminStores();
  app.provide(routerKey, router);
  app.provide(routeLocationKey, route);
  const store = app.runWithContext(() => useAdminSessionStore(pinia));
  const loadAdminData = vi.fn(async () => {});
  Object.assign(useAdminOverviewStore(), { loadOverview: loadAdminData });
  Object.assign(useAdminServerSettingsStore(), { loadServerSettings: vi.fn(async () => {}) });
  return { session: store, route, router, loadAdminData };
}

let fetchMock: Mock<(...args: any[]) => Promise<Response>>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("useAdminSessionStore", () => {
  it("loadAdminView sends an unauthenticated visitor to the login screen", async () => {
    fetchMock.mockResolvedValue(respond(200, { authenticated: false }));
    const { session, router } = setup("/admin");
    await session.loadAdminView();
    expect(session.screen).toBe("login");
    expect(router.replace).toHaveBeenCalledWith("/admin/login");
    expect(session.loading).toBe(false);
  });

  it("loadAdminView routes a must-change-password session to the change screen", async () => {
    fetchMock.mockResolvedValue(respond(200, { authenticated: true, mustChangePassword: true, csrfToken: "c1" }));
    const { session, router } = setup("/admin");
    await session.loadAdminView();
    expect(session.screen).toBe("change-password");
    expect(session.csrfToken).toBe("c1");
    expect(router.replace).toHaveBeenCalledWith("/admin/change-password");
  });

  it("loadAdminView loads the console data", async () => {
    fetchMock.mockImplementation(async () => respond(200, { authenticated: true, csrfToken: "c2" }));
    const first = setup("/admin/login");
    await first.session.loadAdminView();
    expect(first.session.screen).toBe("admin");
    expect(first.router.replace).toHaveBeenCalledWith("/admin");
    expect(first.loadAdminData).toHaveBeenCalled();
  });

  it("loadAdminView shows requestFailed when the session request fails", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const { session } = setup();
    await session.loadAdminView();
    expect(session.errorMessage).not.toBe("");
    expect(session.loading).toBe(false);
  });

  it("login stores the token, clears the password and enters the console", async () => {
    fetchMock.mockResolvedValue(respond(200, { csrfToken: "c3" }));
    const { session, router, loadAdminData } = setup("/admin/login");
    session.loginUsername = "  root ";
    session.loginPassword = "pw";
    await session.login();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ username: "root", password: "pw" });
    expect(session.csrfToken).toBe("c3");
    expect(session.loginPassword).toBe("");
    expect(session.screen).toBe("admin");
    expect(router.replace).toHaveBeenCalledWith("/admin");
    expect(loadAdminData).toHaveBeenCalled();
    expect(session.submitting).toBe(false);
  });

  it("login surfaces the server error code", async () => {
    fetchMock.mockResolvedValue(respond(401, { code: "INVALID_PASSWORD" }));
    const { session } = setup("/admin/login");
    await session.login();
    expect(session.errorMessage).toBe(session.errorText("INVALID_PASSWORD"));
    expect(session.errorMessage).not.toBe("");
    expect(session.screen).toBe("login");
    expect(session.submitting).toBe(false);
  });

  it("changePassword validates length and match before sending", async () => {
    const { session } = setup();
    session.newPassword = "short";
    await session.changePassword();
    expect(session.errorMessage).not.toBe("");
    const lengthError = session.errorMessage;
    session.newPassword = "a-long-enough-password";
    session.confirmNewPassword = "different-password!";
    await session.changePassword();
    expect(session.errorMessage).not.toBe(lengthError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("changePassword enters the console and clears the fields", async () => {
    fetchMock.mockResolvedValue(respond(200, {}));
    const { session, loadAdminData } = setup("/admin/change-password");
    session.newPassword = session.confirmNewPassword = "a-long-enough-password";
    await session.changePassword();
    expect(session.screen).toBe("admin");
    expect(session.newPassword).toBe("");
    expect(session.confirmNewPassword).toBe("");
    expect(loadAdminData).toHaveBeenCalled();
  });

  it("logout drops the token and returns to login even when the request fails", async () => {
    fetchMock.mockResolvedValueOnce(respond(200, { authenticated: true, csrfToken: "c4" }));
    const { session, router } = setup("/admin");
    await session.loadAdminView();
    fetchMock.mockResolvedValueOnce(respond(500, { code: "X" }));
    await expect(session.logout()).rejects.toMatchObject({ code: "X" });
    expect(session.csrfToken).toBe("");
    expect(session.screen).toBe("login");
    expect(router.replace).toHaveBeenLastCalledWith("/admin/login");
  });

  it("logout empties what the other admin stores were holding", async () => {
    fetchMock.mockResolvedValue(respond(200, {}));
    const { session } = setup("/admin");
    const overview = useAdminOverviewStore();
    const operations = useAdminOperationsStore();
    const server = useAdminServerSettingsStore();
    overview.overview.gateway.version = "1.2.3";
    operations.operations.sessions = [{ id: "s1" } as never];
    operations.createdInvite = { token: "t", link: "l" };
    server.serverForm.address = "ts.example.com";
    server.welcomeLanguage = "de";
    server.testResult = { ok: true };
    await session.logout();
    expect(overview.overview.gateway.version).toBe("");
    expect(operations.operations.sessions).toEqual([]);
    expect(operations.createdInvite).toBeNull();
    expect(server.serverForm.address).toBe("");
    expect(server.welcomeLanguage).toBe("en");
    expect(server.testResult).toBeNull();
  });

  it("a 401 while in the console falls back to login; elsewhere it does not redirect", async () => {
    fetchMock.mockResolvedValueOnce(respond(200, { authenticated: true, csrfToken: "c5" }));
    const { session, router } = setup("/admin");
    await session.loadAdminView();
    router.replace.mockClear();
    fetchMock.mockResolvedValueOnce(respond(401, { code: "UNAUTHENTICATED" }));
    await expect(session.getJson("/api/admin/overview")).rejects.toBeTruthy();
    expect(session.screen).toBe("login");
    expect(router.replace).toHaveBeenCalledWith("/admin/login");

    router.replace.mockClear();
    fetchMock.mockResolvedValueOnce(respond(401, { code: "UNAUTHENTICATED" }));
    await expect(session.getJson("/x")).rejects.toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("passwordStrength grows with length and special characters, within 8..100", () => {
    const { session } = setup();
    session.newPassword = "";
    expect(session.passwordStrength).toBe(8);
    session.newPassword = "abcd";
    expect(session.passwordStrength).toBe(20);
    session.newPassword = "abcd!";
    expect(session.passwordStrength).toBe(40);
    session.newPassword = "x".repeat(40);
    expect(session.passwordStrength).toBe(100);
  });
});

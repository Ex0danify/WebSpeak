import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdminApi } from "@/features/admin/core/adminApi";

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("createAdminApi", () => {
  it("getJson returns the parsed body and asks for JSON", async () => {
    const fetchMock = vi.fn(async () => respond(200, { ok: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    const api = createAdminApi({ getCsrfToken: () => "", onUnauthorized: vi.fn() });
    expect(await api.getJson("/api/admin/overview")).toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/overview", { headers: { accept: "application/json" } });
  });

  it("sendJson sends the CSRF token read at call time, unless unauthenticated", async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => respond(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    let token = "";
    const api = createAdminApi({ getCsrfToken: () => token, onUnauthorized: vi.fn() });
    await api.sendJson("/x", "POST", { a: 1 });
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).not.toHaveProperty("x-csrf-token");
    token = "tok";
    await api.sendJson("/x", "POST", { a: 1 });
    expect((fetchMock.mock.calls[1][1] as RequestInit).headers).toHaveProperty("x-csrf-token", "tok");
    await api.sendJson("/x", "POST", {}, false);
    expect((fetchMock.mock.calls[2][1] as RequestInit).headers).not.toHaveProperty("x-csrf-token");
    expect((fetchMock.mock.calls[1][1] as RequestInit).body).toBe('{"a":1}');
  });

  it("throws an ApiError carrying the server code, and reports 401", async () => {
    const onUnauthorized = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond(401, { code: "INVALID_PASSWORD" })),
    );
    const api = createAdminApi({ getCsrfToken: () => "", onUnauthorized });
    await expect(api.getJson("/x")).rejects.toMatchObject({ code: "INVALID_PASSWORD", message: "INVALID_PASSWORD" });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("falls back to REQUEST_FAILED for a non-JSON error body", async () => {
    const onUnauthorized = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500, statusText: "Server Error" })),
    );
    const api = createAdminApi({ getCsrfToken: () => "", onUnauthorized });
    await expect(api.getJson("/x")).rejects.toMatchObject({ code: "REQUEST_FAILED", message: "Server Error" });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("names a request the gateway never answered, by a failed fetch and by a proxy's 502, 503 or 504", async () => {
    const api = createAdminApi({ getCsrfToken: () => "", onUnauthorized: vi.fn() });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(api.getJson("/x")).rejects.toMatchObject({ code: "GATEWAY_UNREACHABLE" });
    await expect(api.sendJson("/x", "POST", {})).rejects.toMatchObject({ code: "GATEWAY_UNREACHABLE" });
    for (const status of [502, 503, 504]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("Bad Gateway", { status })),
      );
      await expect(api.getJson("/x")).rejects.toMatchObject({ code: "GATEWAY_UNREACHABLE" });
    }
  });

  it("keeps the code of the gateway's own 5xx answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond(503, { code: "PING_UNAVAILABLE" })),
    );
    const api = createAdminApi({ getCsrfToken: () => "", onUnauthorized: vi.fn() });
    await expect(api.getJson("/x")).rejects.toMatchObject({ code: "PING_UNAVAILABLE" });
  });
});

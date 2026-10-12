// No admin or join HTTP response carries a sentence. Every refusal is `{ ok: false, code }` (the
// rate limiter adds `retryAfterMs`), the web app renders the code, and nothing here needs an English `message`.
import { describe, expect, it } from "vitest";
import { useGateway } from "./support/gateway.js";

const gateways = useGateway();
const JSON_HEADERS = { "content-type": "application/json" };

async function refusal(response: Response): Promise<Record<string, unknown>> {
  expect(response.ok, `${response.url} -> ${response.status}`).toBe(false);
  return (await response.json()) as Record<string, unknown>;
}

describe("admin and join refusals carry a code and nothing else", () => {
  it("answers unauthenticated, malformed and unknown requests", async () => {
    const gateway = await gateways.start();
    const post = (path: string, body: string, headers: Record<string, string> = JSON_HEADERS) =>
      gateway.request(path, { method: "POST", headers, body });
    const rows: [string, Response, number, string][] = [
      ["no session", await gateway.request("/api/admin/overview"), 401, "AUTH_REQUIRED"],
      ["wrong password", await post("/api/admin/login", JSON.stringify({ username: "admin", password: "wrong" })), 401, "INVALID_PASSWORD"],
      ["broken JSON", await post("/api/admin/login", "{"), 400, "INVALID_JSON"],
      ["unknown route", await gateway.request("/api/nope"), 404, "NOT_FOUND"],
    ];
    for (const [label, response, status, code] of rows) {
      expect([label, response.status, await refusal(response)]).toEqual([label, status, { ok: false, code }]);
    }
  });

  it("answers setting, invite, session and probe errors from a session", async () => {
    const gateway = await gateways.start();
    const admin = await gateway.adminLogin();
    const rows: [string, Response, number, string][] = [
      ["bad invite id", await admin.post("invites/not-an-invite/revoke"), 400, "INVALID_INVITE_ID"],
      ["unknown invite", await admin.post("invites/invite-unknown-1/revoke"), 404, "INVITE_NOT_FOUND"],
      ["unknown session", await admin.post("sessions/unknown/terminate"), 404, "SESSION_NOT_FOUND"],
      ["bad target", await admin.post("server/test", { target: "not a target:::" }), 400, "INVALID_TARGET"],
    ];
    for (const [label, response, status, code] of rows) {
      expect([label, response.status, await refusal(response)]).toEqual([label, status, { ok: false, code }]);
    }
  });

  it("answers join-ticket refusals", async () => {
    const gateway = await gateways.start();
    const response = await gateway.request("/api/join-ticket", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ nickname: "" }),
    });
    const body = await refusal(response);
    expect(Object.keys(body).sort()).toEqual(["code", "ok"]);
    expect(body.ok).toBe(false);
    expect(typeof body.code).toBe("string");
  });
});

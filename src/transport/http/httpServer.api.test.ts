import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { settingsInput } from "../../../test/support/adminService.js";
import { useGateway } from "../../../test/support/gateway.js";

const gateways = useGateway();
const JSON_HEADERS = { "content-type": "application/json" };

describe("health", () => {
  it("answers ok with the version on /health and /api/health", async () => {
    const gateway = await gateways.start();
    for (const path of ["/health", "/api/health"]) {
      const response = await gateway.request(path);
      expect(response.status, path).toBe(200);
      expect(await response.json(), path).toEqual({ status: "ok", version: "9.9.9" });
    }
  });
});

describe("/api/public-config", () => {
  it("returns the defaults, uncached, without acceleration relays", async () => {
    const gateway = await gateways.start();
    const response = await gateway.request("/api/public-config");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const config = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(config).sort()).toEqual([
      "accelerationAvailable",
      "accelerationRelays",
      "accessMode",
      "initialized",
      "siteName",
      "target",
      "version",
      "visitorNumber",
      "visitorTotal",
      "welcomeTexts",
    ]);
    expect(config).toMatchObject({
      version: "9.9.9",
      initialized: true,
      siteName: "WebSpeak",
      accelerationAvailable: false,
      accelerationRelays: [],
    });
    expect(Object.keys(config.welcomeTexts as object).sort()).toEqual(["de", "en"]);
  });

  it("reflects what the administrator saves", async () => {
    const gateway = await gateways.start();
    const admin = await gateway.adminLogin();
    const saved = await admin.put(
      "server",
      settingsInput({
        siteName: "Renamed",
        welcomeTexts: { de: "hallo", en: "hello" },
        target: "voice.example.org:9988",
        accessMode: "fixed",
      }),
    );
    expect(saved.status).toBe(200);
    const config = await (await gateway.request("/api/public-config")).json();
    expect(config).toMatchObject({
      siteName: "Renamed",
      welcomeTexts: { de: "hallo", en: "hello" },
      accessMode: "fixed",
      target: "voice.example.org:9988",
    });
  });

  it("never contains the server password or a relay token after they are saved", async () => {
    const gateway = await gateways.start();
    const admin = await gateway.adminLogin();
    const saved = await admin.put(
      "server",
      settingsInput({
        passwordAction: "replace",
        serverPassword: "s3cret-server-pass",
        relaySettingsAction: "replace",
        relayEnabled: true,
        relayName: "Relay one",
        relayTarget: "relay.example.org:39087",
        relayTokenAction: "replace",
        relayToken: "s3cret-relay-token",
      }),
    );
    expect(saved.status).toBe(200);
    expect(gateway.adminService.getConnectionPolicy().serverPassword, "the password really was saved").toBe("s3cret-server-pass");
    const text = await (await gateway.request("/api/public-config")).text();
    expect(text).not.toContain("s3cret-server-pass");
    expect(text).not.toContain("s3cret-relay-token");
    expect(text).not.toMatch(/password|token/i);
    expect(JSON.parse(text)).toMatchObject({ accelerationAvailable: true, accelerationRelays: [{ name: "Relay one" }] });
  });

  it("numbers a new visitor with a cookie, and counts a returning one only once", async () => {
    const gateway = await gateways.start();
    const first = await gateway.request("/api/public-config");
    const cookie = first.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^webspeak_visitor_number=1; Max-Age=31536000; Path=\/; SameSite=Lax$/);
    expect(await first.json()).toMatchObject({ visitorNumber: 1, visitorTotal: 1 });

    const returning = await gateway.request("/api/public-config", { headers: { cookie: "webspeak_visitor_number=1" } });
    expect(returning.headers.get("set-cookie")).toBeNull();
    expect(await returning.json()).toMatchObject({ visitorNumber: 1, visitorTotal: 1 });

    const other = await gateway.request("/api/public-config");
    expect(other.headers.get("set-cookie")).toContain("webspeak_visitor_number=2");
    expect(await other.json()).toMatchObject({ visitorNumber: 2, visitorTotal: 2 });
  });

  it("ignores a cookie that is not a positive integer and numbers the visitor again", async () => {
    const gateway = await gateways.start();
    for (const value of ["0", "-3", "abc", ""]) {
      const response = await gateway.request("/api/public-config", { headers: { cookie: `webspeak_visitor_number=${value}` } });
      expect(response.headers.get("set-cookie"), JSON.stringify(value)).toContain("webspeak_visitor_number=");
    }
  });
});

describe("static frontend", () => {
  let staticDir = "";
  afterEach(() => rmSync(staticDir, { recursive: true, force: true }));
  const makeStaticDir = () => {
    staticDir = mkdtempSync(join(tmpdir(), "webspeak-static-"));
    mkdirSync(join(staticDir, "assets"));
    writeFileSync(join(staticDir, "index.html"), "<html>the app</html>");
    writeFileSync(join(staticDir, "assets", "app.js"), "console.log('app')");
    return staticDir;
  };

  it("serves files, and falls back to index.html for any other path outside /api and /ws", async () => {
    const gateway = await gateways.start({ staticDir: makeStaticDir() });
    expect(await (await gateway.request("/assets/app.js")).text()).toBe("console.log('app')");
    for (const path of ["/", "/admin", "/some/deep/route", "/__ui"]) {
      const response = await gateway.request(path);
      expect(response.status, path).toBe(200);
      expect(await response.text(), path).toBe("<html>the app</html>");
    }
  });

  it("does not answer /api or /ws paths with index.html", async () => {
    const gateway = await gateways.start({ staticDir: makeStaticDir() });
    for (const path of ["/api/nope", "/api", "/ws/nope", "/ws"]) {
      const response = await gateway.request(path);
      expect(response.status, path).toBe(404);
      expect(await response.text(), path).not.toContain("the app");
    }
  });

  it("serves no frontend at all when there is no static directory", async () => {
    const gateway = await gateways.start();
    expect((await gateway.request("/")).status).toBe(404);
  });
});

describe("JSON body limit", () => {
  const post = (gateway: Awaited<ReturnType<typeof gateways.start>>, bytes: number) =>
    gateway.request("/api/join-ticket", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ nickname: "tester", pad: "x".repeat(bytes) }),
    });

  it("accepts a body just under 100 kB and rejects one over it with 413", async () => {
    const gateway = await gateways.start();
    expect((await post(gateway, 100 * 1024 - 100)).status).toBe(201);
    expect((await post(gateway, 100 * 1024 + 1)).status).toBe(413);
  });

  it("answers a malformed JSON body with 400", async () => {
    const gateway = await gateways.start();
    const response = await gateway.request("/api/join-ticket", { method: "POST", headers: JSON_HEADERS, body: "{oops" });
    expect(response.status).toBe(400);
  });
});

describe("error responses of the API", () => {
  it("an unknown API path answers 404 with a JSON error body", async () => {
    const gateway = await gateways.start();
    const response = await gateway.request("/api/nope");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ ok: false, code: "NOT_FOUND" });
  });

  it("an unknown path below /api with another method answers the same JSON 404", async () => {
    const gateway = await gateways.start();
    const response = await gateway.request("/api/nope/deeper", { method: "POST", headers: JSON_HEADERS, body: "{}" });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, code: "NOT_FOUND" });
  });

  it("a malformed JSON body answers 400 with a JSON error that shows no server path", async () => {
    const gateway = await gateways.start();
    const response = await gateway.request("/api/join-ticket", { method: "POST", headers: JSON_HEADERS, body: "{oops" });
    const text = await response.text();
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(JSON.parse(text)).toEqual({ ok: false, code: "INVALID_JSON" });
    expect(text).not.toContain("node_modules");
  });

  it("a body over the 100 kB limit answers 413 with a JSON error", async () => {
    const gateway = await gateways.start();
    const response = await gateway.request("/api/join-ticket", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ pad: "x".repeat(101 * 1024) }),
    });
    expect(response.status).toBe(413);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ ok: false, code: "PAYLOAD_TOO_LARGE" });
  });

  it("answers an unknown admin path without a session with 401 JSON, not a 404", async () => {
    const gateway = await gateways.start();
    const response = await gateway.request("/api/admin/nope");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, code: "AUTH_REQUIRED" });
  });
});

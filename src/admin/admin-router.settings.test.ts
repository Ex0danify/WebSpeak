import { describe, expect, it, vi } from "vitest";
import { settingsInput } from "../../test/helpers/admin-service.js";
import { type AdminApi, type Gateway, useGateway } from "../../test/helpers/gateway.js";
import { TeamSpeakProbeError } from "../server/teamspeak-probe.js";

const gateways = useGateway();

async function json(response: Response): Promise<Record<string, any>> {
  return await response.json() as Record<string, any>;
}

async function start(options?: Parameters<typeof gateways.start>[0]): Promise<{ gateway: Gateway; admin: AdminApi }> {
  const gateway = await gateways.start(options);
  return { gateway, admin: await gateway.adminLogin() };
}

const audit = (gateway: Gateway) => gateway.database.recentAudit(50).map((row) => row.event);

describe("GET /server", () => {
  it("shows the defaults, with no password or token in it", async () => {
    const { admin } = await start();
    const settings = await json(await admin.get("server"));
    expect(Object.keys(settings).sort()).toEqual([
      "accessMode", "hasPassword", "hasRelayToken", "internalPort", "lastTestAt", "lastTestError", "lastTestLatencyMs",
      "relayConfigured", "relayEnabled", "relayName", "relayNodes", "relayTarget", "siteName", "target", "updatedAt",
      "webRtcEnabled", "webRtcUdpEnd", "webRtcUdpStart", "welcomeDefaults", "welcomeText", "welcomeTextDe",
      "welcomeTextEn", "welcomeTextJa", "welcomeTextRu",
    ]);
    expect(settings).toMatchObject({ hasPassword: false, hasRelayToken: false, webRtcEnabled: false, siteName: "WebSpeak", internalPort: 3040 });
  });
});

describe("PUT /server", () => {
  it("saves, answers with the saved settings, and audits it", async () => {
    const { gateway, admin } = await start();
    const response = await admin.put("server", settingsInput({ siteName: "Renamed", welcomeText: "hallo", welcomeTextEn: "hello", welcomeTextDe: "hallo de", welcomeTextRu: "privet", welcomeTextJa: "konnichiwa" }));
    const saved = await json(response);
    expect(response.status).toBe(200);
    expect(saved).toMatchObject({ ok: true, settings: { siteName: "Renamed", target: "ts.example.org:9988", accessMode: "open", welcomeText: "hallo", welcomeTextEn: "hello", welcomeTextDe: "hallo de", welcomeTextRu: "privet", welcomeTextJa: "konnichiwa" } });
    expect(await json(await admin.get("server"))).toEqual(saved.settings);
    expect(audit(gateway)[0]).toBe("SETTINGS_CHANGED");
  });

  it("round-trips: the values the console reads can be written back unchanged, and the password survives", async () => {
    const { gateway, admin } = await start();
    await admin.put("server", settingsInput({ passwordAction: "replace", serverPassword: "keep-me" }));
    const before = await json(await admin.get("server"));
    const body = {
      target: before.target, accessMode: before.accessMode, siteName: before.siteName, welcomeText: before.welcomeText,
      welcomeTextEn: before.welcomeTextEn, welcomeTextDe: before.welcomeTextDe, welcomeTextRu: before.welcomeTextRu, welcomeTextJa: before.welcomeTextJa,
      webRtcEnabled: before.webRtcEnabled, webRtcUdpStart: before.webRtcUdpStart, webRtcUdpEnd: before.webRtcUdpEnd,
    };
    expect((await admin.put("server", body)).status).toBe(200);
    const after = await json(await admin.get("server"));
    expect({ ...after, updatedAt: null }).toEqual({ ...before, updatedAt: null });
    expect(gateway.adminService.getConnectionPolicy().serverPassword).toBe("keep-me");
  });

  it("never returns the server password or the relay token, in the answer or later", async () => {
    const { admin } = await start();
    const saved = await admin.put("server", settingsInput({
      passwordAction: "replace", serverPassword: "s3cret-server-pass",
      relaySettingsAction: "replace", relayEnabled: true, relayName: "Relay", relayTarget: "relay.example.org:39087", relayTokenAction: "replace", relayToken: "s3cret-relay-token",
    }));
    const texts = [await saved.text(), await (await admin.get("server")).text()];
    for (const text of texts) {
      expect(text).not.toContain("s3cret");
      expect(JSON.parse(text).settings ?? JSON.parse(text)).toMatchObject({ hasPassword: true, hasRelayToken: true, relayEnabled: true });
    }
  });

  it("keeps, replaces or removes the password by passwordAction (keep is the default)", async () => {
    const { gateway, admin } = await start();
    const password = () => gateway.adminService.getConnectionPolicy().serverPassword;
    await admin.put("server", settingsInput({ passwordAction: "replace", serverPassword: "one" }));
    await admin.put("server", settingsInput({ serverPassword: "ignored without an action" }));
    expect(password()).toBe("one");
    await admin.put("server", settingsInput({ passwordAction: "replace", serverPassword: "two" }));
    expect(password()).toBe("two");
    await admin.put("server", settingsInput({ passwordAction: "remove" }));
    expect(password()).toBe("");
    expect(await json(await admin.get("server"))).toMatchObject({ hasPassword: false });
  });

  it("answers a bad value with 400 and the code of the rule, and changes nothing", async () => {
    const { admin } = await start();
    const before = await json(await admin.get("server"));
    const cases: [string, Record<string, unknown>, string][] = [
      ["no target", { target: undefined }, "INVALID_REQUEST"],
      ["target over 300 characters", { target: "t".repeat(301) }, "INVALID_REQUEST"],
      ["target that is not one", { target: "not a target:::" }, "INVALID_TARGET"],
      ["no site name", { siteName: undefined }, "INVALID_REQUEST"],
      ["empty site name", { siteName: "" }, "INVALID_SITE_NAME"],
      ["site name over 80 characters", { siteName: "s".repeat(81) }, "INVALID_REQUEST"],
      ["unknown access mode", { accessMode: "bogus" }, "INVALID_ACCESS_MODE"],
      ["no access mode", { accessMode: undefined }, "INVALID_ACCESS_MODE"],
      ["fractional UDP port", { webRtcUdpStart: 1.5 }, "INVALID_REQUEST"],
      ["UDP port as text", { webRtcUdpEnd: "40000" }, "INVALID_REQUEST"],
      ["UDP port below 1024", { webRtcUdpStart: 500 }, "INVALID_WEBRTC_PORT_RANGE"],
      ["UDP range backwards", { webRtcUdpStart: 50000, webRtcUdpEnd: 40000 }, "INVALID_WEBRTC_PORT_RANGE"],
      ["enabled relay without a name", { relaySettingsAction: "replace", relayEnabled: true, relayTarget: "relay.example.org:39087", relayTokenAction: "replace", relayToken: "t" }, "INVALID_RELAY_NAME"],
      ["enabled relay without a target", { relaySettingsAction: "replace", relayEnabled: true, relayName: "R", relayTokenAction: "replace", relayToken: "t" }, "INVALID_RELAY_TARGET"],
      ["enabled relay without a token", { relaySettingsAction: "replace", relayEnabled: true, relayName: "R", relayTarget: "relay.example.org:39087" }, "INVALID_RELAY_TOKEN"],
    ];
    for (const [label, override, code] of cases) {
      const response = await admin.put("server", { ...settingsInput(), ...override });
      expect([response.status, (await json(response)).code], label).toEqual([400, code]);
    }
    expect((await admin.put("server", [1])).status).toBe(400);
    expect(await json(await admin.get("server"))).toEqual(before);
  });

  it("cuts a welcome text to 500 characters instead of refusing it, and reads a non-boolean webRtcEnabled as off", async () => {
    const { admin } = await start();
    const saved = await json(await admin.put("server", { ...settingsInput(), welcomeText: "w".repeat(600), welcomeTextEn: "e".repeat(501), webRtcEnabled: "yes" }));
    expect(saved.settings.welcomeText).toHaveLength(500);
    expect(saved.settings.welcomeTextEn).toHaveLength(500);
    expect(saved.settings.webRtcEnabled).toBe(false);
  });

  it("locks the UDP port range while WebRTC is on", async () => {
    const { admin } = await start();
    expect((await admin.put("server", settingsInput({ webRtcEnabled: true, webRtcUdpStart: 40000, webRtcUdpEnd: 40100 }))).status).toBe(200);
    const moved = await admin.put("server", settingsInput({ webRtcEnabled: true, webRtcUdpStart: 41000, webRtcUdpEnd: 41100 }));
    expect([moved.status, (await json(moved)).code]).toEqual([400, "WEBRTC_PORT_LOCKED"]);
    expect((await admin.put("server", settingsInput({ webRtcEnabled: true, webRtcUdpStart: 40000, webRtcUdpEnd: 40100 }))).status).toBe(200);
  });
});

describe("POST /server/test", () => {
  const post = (admin: AdminApi, body: Record<string, unknown> = { target: "ts.example.org:9988" }) => admin.post("server/test", body);
  const hostPing = { ok: true, latencyMs: 3, packetLossPercent: 0, attempts: 4, successfulAttempts: 4 };

  it("answers with the handshake's round trip and the host ping, and probes the parsed target", async () => {
    const { gateway, admin } = await start();
    const response = await post(admin);
    expect(await json(response)).toEqual({ ok: true, latencyMs: 12, hostPing });
    expect(gateway.probe).toHaveBeenCalledWith({ host: "ts.example.org", port: 9988 });
    expect(gateway.ping).toHaveBeenCalledWith("ts.example.org");
  });

  it("does not use the server password: the request needs none and the handshake is not given one", async () => {
    const { gateway, admin } = await start();
    await admin.put("server", settingsInput({ passwordAction: "replace", serverPassword: "stored" }));
    await post(admin, { target: "ts.example.org:9988", serverPassword: "typed", passwordAction: "replace" });
    expect(JSON.stringify(gateway.probe.mock.calls)).not.toMatch(/stored|typed/);
    expect(gateway.probe.mock.lastCall).toEqual([{ host: "ts.example.org", port: 9988 }]);
  });

  it("answers a silent port with ok false and its code, and still reports the host ping (a live host, a dead server)", async () => {
    const { gateway, admin } = await start();
    gateway.probe.mockRejectedValueOnce(new TeamSpeakProbeError("NO_ANSWER", "silent"));
    expect(await post(admin).then(async (r) => [r.status, await json(r)])).toEqual([200, { ok: false, latencyMs: null, errorCode: "NO_ANSWER", hostPing }]);
  });

  it("passes when the port answers although the host does not answer ping (ICMP blocked)", async () => {
    const { gateway, admin } = await start();
    gateway.ping.mockResolvedValueOnce({ ok: false, latencyMs: null, packetLossPercent: 100, attempts: 4, successfulAttempts: 0, samples: [], errorCode: "TIMEOUT" });
    expect(await json(await post(admin))).toMatchObject({ ok: true, latencyMs: 12, hostPing: { ok: false, packetLossPercent: 100, errorCode: "TIMEOUT" } });
  });

  it("answers any other error as 400 INTERNAL_ERROR", async () => {
    const { gateway, admin } = await start();
    gateway.probe.mockRejectedValueOnce(new Error("boom"));
    expect(await post(admin).then(async (r) => [r.status, await json(r)])).toEqual([400, { ok: false, code: "INTERNAL_ERROR" }]);
  });

  it("refuses a missing or invalid target without probing", async () => {
    const { gateway, admin } = await start();
    expect(await post(admin, {}).then(async (r) => [r.status, (await json(r)).code])).toEqual([400, "INVALID_REQUEST"]);
    expect(await post(admin, { target: "not a target:::" }).then(async (r) => [r.status, (await json(r)).code])).toEqual([400, "INVALID_TARGET"]);
    expect(gateway.probe).not.toHaveBeenCalled();
    expect(gateway.ping).not.toHaveBeenCalled();
  });

  it("records the result, shows it in the overview, and forgets it when the target changes", async () => {
    const { gateway, admin } = await start();
    expect((await json(await admin.get("overview"))).teamSpeak).toMatchObject({ status: "unknown", lastTestAt: null });
    await post(admin);
    expect((await json(await admin.get("overview"))).teamSpeak).toMatchObject({ status: "reachable", latencyMs: 12, lastError: null });
    gateway.probe.mockRejectedValueOnce(new TeamSpeakProbeError("NO_ANSWER", "silent"));
    await post(admin);
    expect((await json(await admin.get("overview"))).teamSpeak).toMatchObject({ status: "unreachable", lastError: "NO_ANSWER" });
    expect(audit(gateway).slice(0, 2)).toEqual(["CONNECTION_TEST_FAILED", "CONNECTION_TEST_SUCCEEDED"]);
    await admin.put("server", settingsInput({ target: "other.example.org:9987" }));
    expect((await json(await admin.get("overview"))).teamSpeak).toMatchObject({ target: "other.example.org:9987", status: "unknown", lastTestAt: null, lastError: null });
  });
});

describe("GET /overview", () => {
  it("describes the gateway, the target, the sessions and the recent audit events", async () => {
    const { admin } = await start();
    const overview = await json(await admin.get("overview"));
    expect(overview).toMatchObject({
      gateway: { status: "running", version: "9.9.9" },
      teamSpeak: { target: expect.any(String), status: "unknown", lastTestAt: null, latencyMs: null, lastError: null },
      sessions: { active: 0, peak: 0, limit: 100 },
      legacyConfigImported: false,
    });
    expect(overview.gateway.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(overview.recentEvents.map((event: { event: string }) => event.event)).toEqual(expect.arrayContaining(["ADMIN_LOGIN_SUCCEEDED"]));
  });

  it("counts a live session as active, and remembers the peak after it ends", async () => {
    const { gateway, admin } = await start();
    const socket = await gateway.openVoice();
    await socket.waitForMessage("connected");
    expect((await json(await admin.get("overview"))).sessions).toMatchObject({ active: 1, peak: 1 });
    socket.close();
    await vi.waitFor(async () => expect((await json(await admin.get("overview"))).sessions).toMatchObject({ active: 0, peak: 1 }));
  });

  it("shows the legacy import notice until the administrator dismisses it", async () => {
    const { gateway, admin } = await start({ legacyConfig: { tsHost: "legacy.example.org", tsPort: 9000, tsServerPassword: "legacy-secret" } });
    expect((await json(await admin.get("overview"))).legacyConfigImported).toBe(true);
    expect(await json(await admin.get("server"))).toMatchObject({ target: "legacy.example.org:9000", hasPassword: true });
    expect(gateway.adminService.getConnectionPolicy().serverPassword).toBe("legacy-secret");
    expect(await json(await admin.post("legacy-import/dismiss"))).toEqual({ ok: true });
    expect((await json(await admin.get("overview"))).legacyConfigImported).toBe(false);
  });
});

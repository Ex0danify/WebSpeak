import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SERVER_ID, serverInput, settingsInput } from "../../../test/support/adminService.js";
import { type AdminApi, type Gateway, useGateway } from "../../../test/support/gateway.js";
import { TeamSpeakProbeError } from "../teamspeak/teamSpeakProbe.js";

const gateways = useGateway();

async function json(response: Response): Promise<Record<string, any>> {
  return (await response.json()) as Record<string, any>;
}

async function start(options?: Parameters<typeof gateways.start>[0]): Promise<{ gateway: Gateway; admin: AdminApi }> {
  const gateway = await gateways.start(options);
  return { gateway, admin: await gateway.adminLogin() };
}

const audit = (gateway: Gateway) => gateway.database.listAudit({ limit: 50, offset: 0 }).events.map((row) => row.event);

describe("GET /server", () => {
  it("shows the defaults, with no password or token in it", async () => {
    const { admin } = await start();
    const settings = await json(await admin.get("server"));
    expect(Object.keys(settings).sort()).toEqual([
      "accessMode",
      "identityMintConcurrency",
      "identityMintMaxLevel",
      "identityMintQueueDepth",
      "relayNodes",
      "servers",
      "siteName",
      "updatedAt",
      "webRtcEnabled",
      "webRtcUdpEnd",
      "webRtcUdpStart",
      "welcomeDefaults",
      "welcomeTexts",
    ]);
    expect(settings).toMatchObject({
      servers: [{ id: DEFAULT_SERVER_ID, hasPassword: false }],
      relayNodes: [],
      webRtcEnabled: false,
      siteName: "WebSpeak",
    });
  });
});

describe("PUT /server", () => {
  it("saves, answers with the saved settings, and audits it", async () => {
    const { gateway, admin } = await start();
    const response = await admin.put(
      "server",
      settingsInput({ siteName: "Renamed", welcomeTexts: { en: "hello", de: "hallo de", fr: "salut" } }),
    );
    const saved = await json(response);
    expect(response.status).toBe(200);
    expect(saved).toMatchObject({
      ok: true,
      settings: {
        siteName: "Renamed",
        accessMode: "open",
        welcomeTexts: { en: "hello", de: "hallo de", fr: "salut" },
      },
    });
    expect(await json(await admin.get("server"))).toEqual(saved.settings);
    expect(audit(gateway)[0]).toBe("SETTINGS_CHANGED");
  });

  it("writes down what changed, with old and new values, and only that a long text or a relay did", async () => {
    const { gateway, admin } = await start();
    await admin.put("server", settingsInput({ siteName: "Renamed", accessMode: "open", welcomeTexts: { en: "hello" } }));
    const details = () => gateway.database.listAudit({ limit: 1, offset: 0 }).events[0]?.details;
    expect(details()).toMatchObject({
      changes: expect.arrayContaining([{ field: "siteName", from: "WebSpeak", to: "Renamed" }, { field: "welcomeTexts" }]),
      ip: expect.stringMatching(/\S/),
    });
    await admin.put("server", settingsInput({ siteName: "Renamed", accessMode: "open", welcomeTexts: { en: "hello" } }));
    expect(details()).toMatchObject({ changes: [] });
  });

  it("round-trips: the values the console reads can be written back unchanged, and the password survives", async () => {
    const { gateway, admin } = await start();
    await admin.put(`servers/${DEFAULT_SERVER_ID}`, serverInput({ passwordAction: "replace", serverPassword: "keep-me" }));
    const before = await json(await admin.get("server"));
    const body = {
      accessMode: before.accessMode,
      siteName: before.siteName,
      welcomeTexts: before.welcomeTexts,
      webRtcEnabled: before.webRtcEnabled,
      webRtcUdpStart: before.webRtcUdpStart,
      webRtcUdpEnd: before.webRtcUdpEnd,
    };
    expect((await admin.put("server", body)).status).toBe(200);
    const after = await json(await admin.get("server"));
    expect({ ...after, updatedAt: null }).toEqual({ ...before, updatedAt: null });
    expect(gateway.adminService.resolveServer(DEFAULT_SERVER_ID)!.serverPassword).toBe("keep-me");
  });

  it("never returns the server password or the relay token, in the answer or later", async () => {
    const { admin } = await start();
    await admin.put(`servers/${DEFAULT_SERVER_ID}`, serverInput({ passwordAction: "replace", serverPassword: "s3cret-server-pass" }));
    const saved = await admin.put(
      "server",
      settingsInput({
        relayNodes: [
          { name: "Relay", target: "relay.example.org:39087", enabled: true, tokenAction: "replace", token: "s3cret-relay-token" },
        ],
      }),
    );
    const texts = [await saved.text(), await (await admin.get("server")).text()];
    for (const text of texts) {
      expect(text).not.toContain("s3cret");
      expect(JSON.parse(text).settings ?? JSON.parse(text)).toMatchObject({
        servers: [{ hasPassword: true }],
        relayNodes: [{ enabled: true, hasToken: true }],
      });
    }
  });

  it("answers a bad value with 400 and the code of the rule, and changes nothing", async () => {
    const { admin } = await start();
    const before = await json(await admin.get("server"));
    const cases: [string, Record<string, unknown>, string][] = [
      ["no site name", { siteName: undefined }, "INVALID_REQUEST"],
      ["empty site name", { siteName: "" }, "INVALID_SITE_NAME"],
      ["site name over 80 characters", { siteName: "s".repeat(81) }, "INVALID_REQUEST"],
      ["unknown access mode", { accessMode: "bogus" }, "INVALID_ACCESS_MODE"],
      ["no access mode", { accessMode: undefined }, "INVALID_ACCESS_MODE"],
      ["fractional UDP port", { webRtcUdpStart: 1.5 }, "INVALID_REQUEST"],
      ["UDP port as text", { webRtcUdpEnd: "40000" }, "INVALID_REQUEST"],
      ["UDP port below 1024", { webRtcUdpStart: 500 }, "INVALID_WEBRTC_PORT_RANGE"],
      ["UDP range backwards", { webRtcUdpStart: 50000, webRtcUdpEnd: 40000 }, "INVALID_WEBRTC_PORT_RANGE"],
      [
        "enabled relay without a name",
        {
          relayNodes: [
            { name: "", target: "relay.example.org:39087", enabled: true, tokenAction: "replace", token: "relay-token-1234567" },
          ],
        },
        "INVALID_RELAY_NAME",
      ],
      [
        "enabled relay without a target",
        { relayNodes: [{ name: "R", target: "", enabled: true, tokenAction: "replace", token: "relay-token-1234567" }] },
        "INVALID_RELAY_TARGET",
      ],
      [
        "enabled relay without a token",
        { relayNodes: [{ name: "R", target: "relay.example.org:39087", enabled: true }] },
        "INVALID_RELAY_TOKEN",
      ],
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
    const saved = await json(
      await admin.put("server", {
        ...settingsInput(),
        welcomeTexts: { en: "e".repeat(501), de: "d".repeat(600), "not a language": "x", fr: 5 },
        webRtcEnabled: "yes",
      }),
    );
    expect(saved.settings.welcomeTexts.en).toHaveLength(500);
    expect(saved.settings.welcomeTexts.de).toHaveLength(500);
    expect(Object.keys(saved.settings.welcomeTexts).sort()).toEqual(["de", "en"]);
    expect(saved.settings.webRtcEnabled).toBe(false);
  });

  it("locks the UDP port range while WebRTC is on", async () => {
    const { admin } = await start();
    expect((await admin.put("server", settingsInput({ webRtcEnabled: true, webRtcUdpStart: 40000, webRtcUdpEnd: 40100 }))).status).toBe(
      200,
    );
    const moved = await admin.put("server", settingsInput({ webRtcEnabled: true, webRtcUdpStart: 41000, webRtcUdpEnd: 41100 }));
    expect([moved.status, (await json(moved)).code]).toEqual([400, "WEBRTC_PORT_LOCKED"]);
    expect((await admin.put("server", settingsInput({ webRtcEnabled: true, webRtcUdpStart: 40000, webRtcUdpEnd: 40100 }))).status).toBe(
      200,
    );
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
    await admin.put(`servers/${DEFAULT_SERVER_ID}`, serverInput({ passwordAction: "replace", serverPassword: "stored" }));
    await post(admin, { target: "ts.example.org:9988", serverPassword: "typed", passwordAction: "replace" });
    expect(JSON.stringify(gateway.probe.mock.calls)).not.toMatch(/stored|typed/);
    expect(gateway.probe.mock.lastCall).toEqual([{ host: "ts.example.org", port: 9988 }]);
  });

  it("answers a silent port with ok false and its code, and still reports the host ping (a live host, a dead server)", async () => {
    const { gateway, admin } = await start();
    gateway.probe.mockRejectedValueOnce(new TeamSpeakProbeError("NO_ANSWER", "silent"));
    expect(await post(admin).then(async (r) => [r.status, await json(r)])).toEqual([
      200,
      { ok: false, latencyMs: null, errorCode: "NO_ANSWER", hostPing },
    ]);
  });

  it("passes when the port answers although the host does not answer ping (ICMP blocked)", async () => {
    const { gateway, admin } = await start();
    gateway.ping.mockResolvedValueOnce({
      ok: false,
      latencyMs: null,
      packetLossPercent: 100,
      attempts: 4,
      successfulAttempts: 0,
      samples: [],
      errorCode: "TIMEOUT",
    });
    expect(await json(await post(admin))).toMatchObject({
      ok: true,
      latencyMs: 12,
      hostPing: { ok: false, packetLossPercent: 100, errorCode: "TIMEOUT" },
    });
  });

  it("answers any other error as 400 INTERNAL_ERROR", async () => {
    const { gateway, admin } = await start();
    gateway.probe.mockRejectedValueOnce(new Error("boom"));
    expect(await post(admin).then(async (r) => [r.status, await json(r)])).toEqual([400, { ok: false, code: "INTERNAL_ERROR" }]);
  });

  it("refuses a missing or invalid target without probing", async () => {
    const { gateway, admin } = await start();
    expect(await post(admin, {}).then(async (r) => [r.status, (await json(r)).code])).toEqual([400, "INVALID_REQUEST"]);
    expect(await post(admin, { target: "not a target:::" }).then(async (r) => [r.status, (await json(r)).code])).toEqual([
      400,
      "INVALID_TARGET",
    ]);
    expect(gateway.probe).not.toHaveBeenCalled();
    expect(gateway.ping).not.toHaveBeenCalled();
  });

  it("keeps nothing, the dialog tests values that are not saved", async () => {
    const { gateway, admin } = await start();
    await post(admin);
    expect((await json(await admin.get("overview"))).servers[0]).toMatchObject({ status: "unknown", lastTestAt: null });
    expect(audit(gateway)).not.toContain("SERVER_UNAVAILABLE");
  });
});

describe("GET /overview", () => {
  it("describes the gateway, the servers, the sessions and the active invites", async () => {
    const { admin } = await start();
    const overview = await json(await admin.get("overview"));
    expect(overview).toMatchObject({
      gateway: { status: "running", version: "9.9.9" },
      servers: [
        { id: DEFAULT_SERVER_ID, target: expect.any(String), status: "unknown", lastTestAt: null, latencyMs: null, lastError: null },
      ],
      sessions: { active: 0, peak: 0, limit: 100 },
    });
    expect(overview.gateway.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(overview).not.toHaveProperty("recentEvents");
  });

  it("counts a live session as active, and remembers the peak after it ends", async () => {
    const { gateway, admin } = await start();
    const socket = await gateway.openVoice();
    await socket.waitForMessage("connected");
    expect((await json(await admin.get("overview"))).sessions).toMatchObject({ active: 1, peak: 1 });
    socket.close();
    await vi.waitFor(async () => expect((await json(await admin.get("overview"))).sessions).toMatchObject({ active: 0, peak: 1 }));
  });
});

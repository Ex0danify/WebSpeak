import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { credential, settings, useDatabaseFixture } from "../../../test/helpers/database.js";
import type { AdminCredential } from "../security/adminPassword.js";

const fx = useDatabaseFixture();

describe("admin credential", () => {
  it("initializes once, storing the credential, the settings and an audit entry together", () => {
    const database = fx.open();
    database.initializeAdmin(credential, settings());
    expect(database.hasAdmin()).toBe(true);
    expect(database.getAdminCredential()).toEqual(credential);
    expect(database.getSettings()).toMatchObject({ siteName: "Test site", tsHost: "ts.example.org" });
    expect(database.recentAudit()[0]?.event).toBe("ADMIN_INITIALIZED");
  });

  it("rejects a second initialization and leaves the first one untouched", () => {
    const database = fx.open();
    database.initializeAdmin(credential, settings());
    expect(() => database.initializeAdmin({ ...credential, username: "other" }, settings({ siteName: "Other" }))).toThrow("already initialized");
    expect(database.getAdminCredential()?.username).toBe("root");
    expect(database.getSettings().siteName).toBe("Test site");
    expect(database.recentAudit(50).filter((entry) => entry.event === "ADMIN_INITIALIZED")).toHaveLength(1);
  });

  it("replaces the credential", () => {
    const database = fx.open();
    database.initializeAdmin(credential, settings());
    database.updateAdminCredential({ ...credential, hash: "bmV3", mustChangePassword: false });
    expect(database.getAdminCredential()).toMatchObject({ hash: "bmV3", mustChangePassword: false });
  });

  it("fills in a missing username and mustChangePassword flag when reading an old record", () => {
    const database = fx.open();
    database.initializeAdmin(credential, settings());
    const { username: _username, mustChangePassword: _flag, ...old } = credential;
    database.updateAdminCredential(old as AdminCredential);
    expect(database.getAdminCredential()).toMatchObject({ username: "admin", mustChangePassword: false, hash: "aGFzaA" });
  });

  it("treats only a literal true as mustChangePassword", () => {
    const database = fx.open();
    database.initializeAdmin(credential, settings());
    database.updateAdminCredential({ ...credential, mustChangePassword: "yes" } as unknown as AdminCredential);
    expect(database.getAdminCredential()?.mustChangePassword).toBe(false);
  });
});

describe("settings", () => {
  it("round trips every field of an update", () => {
    const database = fx.open();
    database.updateSettings(settings());
    expect(database.getSettings()).toMatchObject({
      siteName: "Test site",
      welcomeText: "zh",
      welcomeTextEn: "en",
      welcomeTextDe: "de",
      welcomeTextRu: "ru",
      welcomeTextJa: "ja",
      accessMode: "open",
      tsHost: "ts.example.org",
      tsPort: 9988,
      tsPasswordEncrypted: "enc:password",
      webRtcEnabled: true,
      webRtcUdpStart: 41000,
      webRtcUdpEnd: 41010,
      relayConfigured: true,
      relayEnabled: true,
      relayName: "relay",
      relayHost: "relay.example.org",
      relayPort: 40000,
      relayTokenEncrypted: "enc:token",
    });
  });

  it("stores optional welcome texts and the WebRTC range as defaults when they are omitted", () => {
    const database = fx.open();
    const { welcomeTextEn: _en, welcomeTextDe: _de, welcomeTextRu: _ru, welcomeTextJa: _ja, webRtcUdpStart: _s, webRtcUdpEnd: _e, ...minimal } = settings();
    database.updateSettings(minimal);
    expect(database.getSettings()).toMatchObject({ welcomeTextEn: "", welcomeTextDe: "", welcomeTextRu: "", welcomeTextJa: "", webRtcUdpStart: 40000, webRtcUdpEnd: 40099 });
  });

  it("audits every save with the access mode and target, under the given event name", () => {
    const database = fx.open();
    database.updateSettings(settings());
    database.updateSettings(settings({ tsPort: 9989 }), "LEGACY_CONFIG_IMPORTED");
    const raw = new DatabaseSync(fx.path);
    try {
      const rows = raw.prepare("SELECT event, details_json FROM audit_events ORDER BY id").all() as Array<{ event: string; details_json: string }>;
      expect(rows.map((row) => row.event)).toEqual(["SETTINGS_CHANGED", "LEGACY_CONFIG_IMPORTED"]);
      expect(JSON.parse(rows[1]!.details_json)).toEqual({ accessMode: "open", target: "ts.example.org:9989" });
    } finally {
      raw.close();
    }
  });

  it("rolls back a rejected save: no partial settings and no audit entry", () => {
    const database = fx.open();
    database.updateSettings(settings());
    expect(() => database.updateSettings(settings({ siteName: "Changed", tsPort: 70000 }))).toThrow();
    expect(database.getSettings()).toMatchObject({ siteName: "Test site", tsPort: 9988 });
    expect(database.recentAudit(50).filter((entry) => entry.event === "SETTINGS_CHANGED")).toHaveLength(1);
    // The failed transaction released its lock: the next write works.
    database.updateSettings(settings({ siteName: "Again" }));
    expect(database.getSettings().siteName).toBe("Again");
  });

  it("records a connection test and clears it again", () => {
    const database = fx.open();
    database.recordConnectionTest({ protocol: "ts6", latencyMs: 42, error: null });
    expect(database.getSettings()).toMatchObject({ detectedProtocol: "ts6", lastTestLatencyMs: 42, lastTestError: null });
    expect(Date.parse(database.getSettings().lastTestAt!)).not.toBeNaN();
    database.recordConnectionTest({ protocol: null, latencyMs: null, error: "TIMEOUT" });
    expect(database.getSettings()).toMatchObject({ detectedProtocol: null, lastTestLatencyMs: null, lastTestError: "TIMEOUT" });
    database.clearConnectionTest();
    expect(database.getSettings()).toMatchObject({ detectedProtocol: null, lastTestAt: null, lastTestLatencyMs: null, lastTestError: null });
  });

  it("does not let a settings save clear the last connection test (the service does that on a target change)", () => {
    const database = fx.open();
    database.recordConnectionTest({ protocol: "ts3", latencyMs: 10, error: null });
    database.updateSettings(settings({ tsHost: "other.example.org" }));
    expect(database.getSettings().detectedProtocol).toBe("ts3");
  });

  it("rejects an unknown protocol in a connection test", () => {
    const database = fx.open();
    expect(() => database.recordConnectionTest({ protocol: "ts5" as never, latencyMs: 1, error: null })).toThrow();
  });
});

describe("relay nodes", () => {
  const node = (id: string, overrides = {}) => ({ id, name: id, enabled: true, host: `${id}.example.org`, port: 39087, tokenEncrypted: "enc", ...overrides });

  it("replaces the whole list and lists it oldest first", () => {
    const database = fx.open();
    database.replaceRelayNodes([
      node("b", { createdAt: "2024-01-02T00:00:00.000Z" }),
      node("a", { createdAt: "2024-01-01T00:00:00.000Z" }),
    ]);
    expect(database.listRelayNodes().map((entry) => entry.id)).toEqual(["a", "b"]);
    database.replaceRelayNodes([node("c")]);
    expect(database.listRelayNodes().map((entry) => entry.id)).toEqual(["c"]);
    database.replaceRelayNodes([]);
    expect(database.listRelayNodes()).toEqual([]);
  });

  it("maps the enabled flag and keeps a null token", () => {
    const database = fx.open();
    database.replaceRelayNodes([node("a", { enabled: false, tokenEncrypted: null })]);
    expect(database.listRelayNodes()[0]).toMatchObject({ enabled: false, tokenEncrypted: null });
  });

  it("keeps the old list when the new one is rejected (duplicate id)", () => {
    const database = fx.open();
    database.replaceRelayNodes([node("keep")]);
    expect(() => database.replaceRelayNodes([node("dup"), node("dup")])).toThrow();
    expect(database.listRelayNodes().map((entry) => entry.id)).toEqual(["keep"]);
  });
});

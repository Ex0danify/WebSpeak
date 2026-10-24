import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { credential, invite, settings, useDatabaseFixture } from "../../../test/support/database.js";
import type { AdminCredential } from "../security/adminPassword.js";

const fx = useDatabaseFixture();

describe("audit pruning", () => {
  it("keeps only the newest rows", () => {
    const database = fx.open();
    for (let i = 1; i <= 7; i++) database.addAudit(`EVENT_${i}`);
    expect(database.pruneAudit(3)).toBe(4);
    expect(database.recentAudit(50).map((entry) => entry.event)).toEqual(["EVENT_7", "EVENT_6", "EVENT_5"]);
    expect(database.pruneAudit(3)).toBe(0);
  });
});

describe("admin credential", () => {
  it("initializes once, storing the credential, the settings and an audit entry together", () => {
    const database = fx.open();
    database.initializeAdmin(credential, settings());
    expect(database.hasAdmin()).toBe(true);
    expect(database.getAdminCredential()).toEqual(credential);
    expect(database.getSettings()).toMatchObject({ siteName: "Test site" });
    expect(database.recentAudit()[0]?.event).toBe("ADMIN_INITIALIZED");
  });

  it("rejects a second initialization and leaves the first one untouched", () => {
    const database = fx.open();
    database.initializeAdmin(credential, settings());
    expect(() => database.initializeAdmin({ ...credential, username: "other" }, settings({ siteName: "Other" }))).toThrow(
      "already initialized",
    );
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
      welcomeTexts: { de: "de", en: "en" },
      accessMode: "open",
      webRtcEnabled: true,
      webRtcUdpStart: 41000,
      webRtcUdpEnd: 41010,
    });
  });

  it("stores no welcome texts and the default WebRTC range when they are omitted", () => {
    const database = fx.open();
    const { welcomeTexts: _texts, webRtcUdpStart: _s, webRtcUdpEnd: _e, ...minimal } = settings();
    database.updateSettings(minimal);
    expect(database.getSettings()).toMatchObject({ welcomeTexts: {}, webRtcUdpStart: 40000, webRtcUdpEnd: 40099 });
  });

  it("replaces the stored welcome texts on every save and does not store empty ones", () => {
    const database = fx.open();
    database.updateSettings(settings({ welcomeTexts: { en: "hello", de: "hallo", fr: "salut" } }));
    database.updateSettings(settings({ welcomeTexts: { en: "hi", de: "  " } }));
    expect(database.getSettings().welcomeTexts).toEqual({ en: "hi" });
  });

  it("audits every save with the access mode", () => {
    const database = fx.open();
    database.updateSettings(settings());
    database.updateSettings(settings({ accessMode: "fixed" }));
    const raw = new DatabaseSync(fx.path);
    try {
      const rows = raw.prepare("SELECT event, details_json FROM audit_events ORDER BY id").all() as Array<{
        event: string;
        details_json: string;
      }>;
      expect(rows.map((row) => row.event)).toEqual(["SETTINGS_CHANGED", "SETTINGS_CHANGED"]);
      expect(JSON.parse(rows[1]!.details_json)).toEqual({ accessMode: "fixed" });
    } finally {
      raw.close();
    }
  });

  it("rolls back a rejected save: no partial settings and no audit entry", () => {
    const database = fx.open();
    database.updateSettings(settings());
    expect(() => database.updateSettings(settings({ siteName: "Changed", webRtcUdpStart: 70000 }))).toThrow();
    expect(database.getSettings()).toMatchObject({ siteName: "Test site", webRtcUdpStart: 41000 });
    expect(database.recentAudit(50).filter((entry) => entry.event === "SETTINGS_CHANGED")).toHaveLength(1);
    // The failed transaction released its lock: the next write works.
    database.updateSettings(settings({ siteName: "Again" }));
    expect(database.getSettings().siteName).toBe("Again");
  });
});

describe("servers", () => {
  const server = (id: string, overrides = {}) => ({
    id,
    name: id,
    host: `${id}.example.org`,
    port: 9987,
    passwordEncrypted: null,
    ...overrides,
  });

  it("starts with the default server the migration seeds", () => {
    expect(fx.open().listServers()).toMatchObject([{ id: "server-default", host: "127.0.0.1", port: 9987 }]);
  });

  it("records a connection test per server", () => {
    const database = fx.open();
    database.addServer(server("one"));
    database.recordConnectionTest("one", { latencyMs: 42, error: null });
    expect(database.getServer("one")).toMatchObject({ lastTestLatencyMs: 42, lastTestError: null });
    expect(Date.parse(database.getServer("one")!.lastTestAt!)).not.toBeNaN();
    expect(database.getServer("server-default")!.lastTestAt).toBeNull();
    database.recordConnectionTest("one", { latencyMs: null, error: "TIMEOUT" });
    expect(database.getServer("one")).toMatchObject({ lastTestLatencyMs: null, lastTestError: "TIMEOUT" });
  });

  it("audits adding, changing and removing a server", () => {
    const database = fx.open();
    database.addServer(server("one"));
    database.updateServer(server("one", { name: "Renamed" }), false);
    expect(database.removeServer("one")).toBe(true);
    expect(database.removeServer("one")).toBe(false);
    const events = database.recentAudit(10).map((entry) => entry.event);
    expect(events).toEqual(expect.arrayContaining(["SERVER_ADDED", "SERVER_UPDATED", "SERVER_REMOVED"]));
    expect(events.filter((event) => event === "SERVER_REMOVED")).toHaveLength(1);
  });

  it("revokes the invites of a removed server and leaves the others", () => {
    const database = fx.open();
    database.addServer(server("one"));
    database.createManagedInvite(invite("invite-a", { serverId: "one" }));
    database.createManagedInvite(invite("invite-b", { serverId: "server-default" }));
    database.removeServer("one");
    const byId = Object.fromEntries(database.listManagedInvites().map((entry) => [entry.id, entry.revokedAt]));
    expect(byId["invite-a"]).not.toBeNull();
    expect(byId["invite-b"]).toBeNull();
  });

  it("revokes invites on a changed connection but not on a rename", () => {
    const database = fx.open();
    database.addServer(server("one"));
    database.createManagedInvite(invite("invite-a", { serverId: "one" }));
    database.updateServer(server("one", { name: "Renamed" }), false);
    expect(database.listManagedInvites()[0]!.revokedAt).toBeNull();
    database.updateServer(server("one", { port: 9988 }), true);
    expect(database.listManagedInvites()[0]!.revokedAt).not.toBeNull();
  });
});

describe("relay nodes", () => {
  const node = (id: string, overrides = {}) => ({
    id,
    name: id,
    enabled: true,
    host: `${id}.example.org`,
    port: 39087,
    tokenEncrypted: "enc",
    ...overrides,
  });

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

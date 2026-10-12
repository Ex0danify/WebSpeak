import { describe, expect, it } from "vitest";
import { BOOTSTRAP, settingsInput, useAdminService } from "../../../test/support/adminService.js";
import { DEFAULT_WELCOME_TEXTS } from "./siteCopy.js";
import { AdminInputError } from "./adminService.js";

const ctx = useAdminService();

function rejection(action: () => unknown): AdminInputError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(AdminInputError);
    return error as AdminInputError;
  }
  throw new Error("expected the action to throw");
}

describe("initialize", () => {
  it("creates the account from the bootstrap credentials, and it must change its password", async () => {
    const service = ctx.create();
    expect(service.isInitialized()).toBe(false);
    await service.initialize({ username: "ops", password: BOOTSTRAP.password });
    expect(service.isInitialized()).toBe(true);
    expect(service.isPasswordChangeRequired()).toBe(true);
    expect(ctx.logger.info).toHaveBeenCalledTimes(1);
    expect(await service.verifyPassword("ops", BOOTSTRAP.password)).toBe(true);
    expect(await service.verifyPassword("admin", BOOTSTRAP.password)).toBe(false);
  });

  it("refuses to start a fresh database without bootstrap credentials", async () => {
    const service = ctx.create();
    await expect(service.initialize()).rejects.toThrow(/WEBSPEAK_ADMIN_PASSWORD/);
    expect(service.isInitialized()).toBe(false);
    expect(await service.verifyPassword("admin", BOOTSTRAP.password)).toBe(false);
  });

  it("does not create the account twice or reset a changed password", async () => {
    const service = ctx.create();
    await service.initialize(BOOTSTRAP);
    await service.changePassword("a-new-strong-password");
    await service.initialize({ username: "other", password: "another initial password 2" });
    expect(ctx.logger.info).toHaveBeenCalledTimes(1);
    expect(service.isPasswordChangeRequired()).toBe(false);
    expect(await service.verifyPassword("admin", "a-new-strong-password")).toBe(true);
  });

  it("needs no bootstrap credentials once an account exists", async () => {
    await ctx.create().initialize(BOOTSTRAP);
    await expect(ctx.create().initialize()).resolves.toBeUndefined();
  });

  it("leaves the default settings in place", async () => {
    const service = ctx.create();
    await service.initialize(BOOTSTRAP);
    expect(service.database.getSettings()).toMatchObject({ tsHost: "127.0.0.1", tsPort: 9987 });
    expect(service.database.recentAudit(50).map((entry) => entry.event)).toContain("ADMIN_INITIALIZED");
  });

  it("shows the port the gateway listens on", () => {
    expect(ctx.create().getAdminSettings()).toMatchObject({ internalPort: 3040 });
  });
});

describe("admin password", () => {
  it("rejects a wrong password, a wrong username, and any login before initialization", async () => {
    const service = ctx.create();
    expect(await service.verifyPassword("admin", BOOTSTRAP.password)).toBe(false);
    await service.initialize(BOOTSTRAP);
    expect(await service.verifyPassword("admin", "wrong")).toBe(false);
    expect(await service.verifyPassword("root", BOOTSTRAP.password)).toBe(false);
  });

  it("changes the password: the old one stops working, the change flag clears, an audit entry is written", async () => {
    const service = ctx.create();
    await service.initialize(BOOTSTRAP);
    await service.changePassword("a-new-strong-password");
    expect(await service.verifyPassword("admin", BOOTSTRAP.password)).toBe(false);
    expect(await service.verifyPassword("admin", "a-new-strong-password")).toBe(true);
    expect(service.isPasswordChangeRequired()).toBe(false);
    expect(service.database.recentAudit()[0]?.event).toBe("ADMIN_PASSWORD_CHANGED");
  });

  it("refuses a short password and keeps the current one", async () => {
    const service = ctx.create();
    await service.initialize(BOOTSTRAP);
    await expect(service.changePassword("short")).rejects.toMatchObject({ code: "INVALID_ADMIN_PASSWORD" });
    expect(await service.verifyPassword("admin", BOOTSTRAP.password)).toBe(true);
    expect(service.isPasswordChangeRequired()).toBe(true);
  });

  it("refuses a change before the account exists", async () => {
    await expect(ctx.create().changePassword("a-new-strong-password")).rejects.toMatchObject({ code: "NOT_INITIALIZED" });
  });
});

describe("views", () => {
  it("public config shows the site, target and access mode, with the welcome text in every language", () => {
    const service = ctx.create();
    service.updateSettings(settingsInput({ welcomeTexts: { en: "en text", fr: "fr text" } }));
    const config = service.getPublicConfig() as { welcomeTexts: Record<string, string> } & Record<string, unknown>;
    expect(config).toMatchObject({
      version: "9.9.9",
      initialized: false,
      siteName: "Test site",
      accessMode: "open",
      target: "ts.example.org:9988",
    });
    expect(config).not.toHaveProperty("welcomeText");
    expect(config).not.toHaveProperty("welcomeTextEn");
    expect(config.welcomeTexts).toMatchObject({ en: "en text", fr: "fr text", de: DEFAULT_WELCOME_TEXTS.de });
  });

  it("public config leaks neither the server password nor relay data", () => {
    const service = ctx.create();
    service.updateSettings(
      settingsInput({
        serverPassword: "very-secret-password",
        relayNodes: [{ name: "R", target: "relay.example.org", enabled: true, token: "relay-token-1234567" }],
      }),
    );
    const text = JSON.stringify(service.getPublicConfig());
    for (const secret of ["very-secret-password", "relay-token-1234567", "relay.example.org", "v1:"]) expect(text).not.toContain(secret);
  });

  it("admin settings report whether secrets exist but never their value or ciphertext", () => {
    const service = ctx.create();
    service.updateSettings(
      settingsInput({
        serverPassword: "very-secret-password",
        relayNodes: [{ name: "R", target: "relay.example.org", enabled: true, token: "relay-token-1234567" }],
      }),
    );
    const view = service.getAdminSettings();
    expect(view).toMatchObject({ hasPassword: true, target: "ts.example.org:9988", welcomeDefaults: DEFAULT_WELCOME_TEXTS });
    expect((view.relayNodes as unknown[])[0]).toMatchObject({ name: "R", target: "relay.example.org#39087", hasToken: true });
    const text = JSON.stringify(view);
    for (const secret of ["very-secret-password", "relay-token-1234567", "v1:"]) expect(text).not.toContain(secret);
  });

  it("writes an IPv6 relay target with brackets", () => {
    const service = ctx.create();
    service.updateSettings(settingsInput({ relayNodes: [{ name: "R", target: "[2001:db8::1]:40000", enabled: false }] }));
    expect((service.getAdminSettings().relayNodes as Array<{ target: string }>)[0]?.target).toBe("[2001:db8::1]#40000");
  });
});

describe("updateSettings validation", () => {
  const cases: Array<[string, Parameters<typeof settingsInput>[0], string]> = [
    ["an unparsable target", { target: "not a target:::" }, "INVALID_TARGET"],
    ["an empty site name", { siteName: "   " }, "INVALID_SITE_NAME"],
    ["a site name over 80 characters", { siteName: "x".repeat(81) }, "INVALID_SITE_NAME"],
    ["an English welcome text over 500 characters", { welcomeTexts: { en: "x".repeat(501) } }, "INVALID_WELCOME_TEXT"],
    ["a German welcome text over 500 characters", { welcomeTexts: { de: "x".repeat(501) } }, "INVALID_WELCOME_TEXT"],
    ["an unknown access mode", { accessMode: "closed" as never }, "INVALID_ACCESS_MODE"],
    ["a non-boolean WebRTC flag", { webRtcEnabled: "yes" as never }, "INVALID_WEBRTC_ENABLED"],
    ["a WebRTC start port below 1024", { webRtcUdpStart: 1023, webRtcUdpEnd: 2000 }, "INVALID_WEBRTC_PORT_RANGE"],
    ["a WebRTC end port above 65535", { webRtcUdpStart: 2000, webRtcUdpEnd: 65536 }, "INVALID_WEBRTC_PORT_RANGE"],
    ["a fractional WebRTC port", { webRtcUdpStart: 2000.5, webRtcUdpEnd: 3000 }, "INVALID_WEBRTC_PORT_RANGE"],
    ["a WebRTC range where start exceeds end", { webRtcUdpStart: 3000, webRtcUdpEnd: 2000 }, "INVALID_WEBRTC_PORT_RANGE"],
  ];

  it.each(cases)("rejects %s and changes nothing", (_name, overrides, code) => {
    const service = ctx.create();
    const before = service.database.getSettings();
    expect(rejection(() => service.updateSettings(settingsInput(overrides))).code).toBe(code);
    expect(service.database.getSettings()).toEqual(before);
  });

  it("accepts the limits: 80 character name, 500 character texts, ports 1024 and 65535", () => {
    const service = ctx.create();
    service.updateSettings(
      settingsInput({
        siteName: "x".repeat(80),
        welcomeTexts: { en: "y".repeat(500), de: "z".repeat(500) },
        webRtcUdpStart: 1024,
        webRtcUdpEnd: 65535,
      }),
    );
    expect(service.database.getSettings()).toMatchObject({ webRtcUdpStart: 1024, webRtcUdpEnd: 65535 });
  });

  it("trims the site name and welcome texts", () => {
    const service = ctx.create();
    service.updateSettings(settingsInput({ siteName: "  Name  ", welcomeTexts: { en: " en ", de: "  de  " } }));
    expect(service.database.getSettings()).toMatchObject({ siteName: "Name", welcomeTexts: { en: "en", de: "de" } });
  });

  it("keeps a language's welcome text when the form omits it, and clears it when the form sends an empty string", () => {
    const service = ctx.create();
    service.updateSettings(settingsInput({ welcomeTexts: { de: "hallo", en: "hello" } }));
    service.updateSettings(settingsInput({ welcomeTexts: { en: "" } }));
    expect(service.database.getSettings().welcomeTexts).toEqual({ de: "hallo" });
    service.updateSettings(settingsInput());
    expect(service.database.getSettings().welcomeTexts).toEqual({ de: "hallo" });
  });

  it("keeps the current WebRTC range when the form omits it", () => {
    const service = ctx.create();
    service.updateSettings(settingsInput({ webRtcUdpStart: 41000, webRtcUdpEnd: 41010 }));
    service.updateSettings(settingsInput());
    expect(service.getWebRtcAudioOptions()).toEqual({ enabled: false, udpPortRange: [41000, 41010] });
  });

  it("locks the WebRTC range while WebRTC is on, but allows saving the same range or turning it off", () => {
    const service = ctx.create();
    service.updateSettings(settingsInput({ webRtcEnabled: true, webRtcUdpStart: 41000, webRtcUdpEnd: 41010 }));
    expect(
      rejection(() => service.updateSettings(settingsInput({ webRtcEnabled: true, webRtcUdpStart: 42000, webRtcUdpEnd: 42010 }))).code,
    ).toBe("WEBRTC_PORT_LOCKED");
    service.updateSettings(settingsInput({ webRtcEnabled: true, siteName: "Same range", webRtcUdpStart: 41000, webRtcUdpEnd: 41010 }));
    service.updateSettings(settingsInput({ webRtcEnabled: false, webRtcUdpStart: 41000, webRtcUdpEnd: 41010 }));
    expect(service.getWebRtcAudioOptions()).toEqual({ enabled: false, udpPortRange: [41000, 41010] });
  });
});

describe("server password", () => {
  it("stores the password encrypted and returns it through the connection policy", () => {
    const service = ctx.create();
    service.updateSettings(settingsInput({ serverPassword: "pw-1" }));
    const stored = service.database.getSettings().tsPasswordEncrypted;
    expect(stored).toMatch(/^v1:/);
    expect(stored).not.toContain("pw-1");
    expect(service.getConnectionPolicy()).toEqual({
      defaultTarget: { host: "ts.example.org", port: 9988 },
      serverPassword: "pw-1",
      accessMode: "open",
    });
  });

  it("keeps the stored password by default, and when the action is keep", () => {
    const service = ctx.create();
    service.updateSettings(settingsInput({ serverPassword: "pw-1" }));
    service.updateSettings(settingsInput());
    service.updateSettings(settingsInput({ passwordAction: "keep", serverPassword: "ignored" }));
    expect(service.getConnectionPolicy().serverPassword).toBe("pw-1");
  });

  it("replaces, empties and removes the password", () => {
    const service = ctx.create();
    service.updateSettings(settingsInput({ serverPassword: "pw-1" }));
    service.updateSettings(settingsInput({ passwordAction: "replace", serverPassword: "pw-2" }));
    expect(service.getConnectionPolicy().serverPassword).toBe("pw-2");
    service.updateSettings(settingsInput({ passwordAction: "replace", serverPassword: "" }));
    expect(service.database.getSettings().tsPasswordEncrypted).toBeNull();
    service.updateSettings(settingsInput({ serverPassword: "pw-3" }));
    service.updateSettings(settingsInput({ passwordAction: "remove" }));
    expect(service.database.getSettings().tsPasswordEncrypted).toBeNull();
    expect(service.getAdminSettings().hasPassword).toBe(false);
  });

  it("returns an empty password and logs an error when the stored one cannot be decrypted (wrong master secret)", () => {
    ctx.create().updateSettings(settingsInput({ serverPassword: "pw-1" }));
    const other = ctx.create(Buffer.alloc(32, 9));
    expect(other.getConnectionPolicy().serverPassword).toBe("");
    expect(ctx.logger.error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(ctx.logger.error.mock.calls)).not.toContain("pw-1");
  });
});

describe("connection test result", () => {
  it("is cleared when the target changes and kept when only other settings change", () => {
    const service = ctx.create();
    service.updateSettings(settingsInput());
    service.database.recordConnectionTest({ protocol: "ts6", latencyMs: 12, error: null });
    service.updateSettings(settingsInput({ siteName: "Renamed" }));
    expect(service.database.getSettings().detectedProtocol).toBe("ts6");
    service.updateSettings(settingsInput({ target: "other.example.org:9987" }));
    expect(service.database.getSettings()).toMatchObject({ detectedProtocol: null, lastTestAt: null, lastTestLatencyMs: null });
  });

  it("is cleared when only the port changes", () => {
    const service = ctx.create();
    service.updateSettings(settingsInput());
    service.database.recordConnectionTest({ protocol: "ts3", latencyMs: 5, error: null });
    service.updateSettings(settingsInput({ target: "ts.example.org:9989" }));
    expect(service.database.getSettings().detectedProtocol).toBeNull();
  });
});

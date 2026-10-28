import { describe, expect, it } from "vitest";
import { BOOTSTRAP, DEFAULT_SERVER_ID, serverInput, settingsInput, useAdminService } from "../../../test/support/adminService.js";
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
    expect(service.database.listServers()).toMatchObject([{ id: DEFAULT_SERVER_ID, host: "127.0.0.1", port: 9987 }]);
    expect(service.database.listAudit({ limit: 50, offset: 0 }).events.map((entry) => entry.event)).toContain("ADMIN_INITIALIZED");
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
    expect(service.database.listAudit({ limit: 8, offset: 0 }).events[0]?.event).toBe("ADMIN_PASSWORD_CHANGED");
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
  it("public config shows the site, access mode and server names, with the welcome text in every language", () => {
    const service = ctx.create();
    service.updateSettings(settingsInput({ welcomeTexts: { en: "en text", fr: "fr text" } }));
    service.updateServer(DEFAULT_SERVER_ID, serverInput({ name: "Home" }));
    const config = service.getPublicConfig() as { welcomeTexts: Record<string, string> } & Record<string, unknown>;
    expect(config).toMatchObject({
      version: "9.9.9",
      initialized: false,
      siteName: "Test site",
      accessMode: "open",
      servers: [{ id: DEFAULT_SERVER_ID, name: "Home" }],
    });
    expect(JSON.stringify(config)).not.toContain("ts.example.org");
    expect(config).not.toHaveProperty("welcomeText");
    expect(config).not.toHaveProperty("welcomeTextEn");
    expect(config.welcomeTexts).toMatchObject({ en: "en text", fr: "fr text", de: DEFAULT_WELCOME_TEXTS.de });
  });

  it("public config leaks neither a server address or password nor relay data", () => {
    const service = ctx.create();
    service.updateServer(DEFAULT_SERVER_ID, serverInput({ serverPassword: "very-secret-password" }));
    service.updateSettings(
      settingsInput({ relayNodes: [{ name: "R", target: "relay.example.org", enabled: true, token: "relay-token-1234567" }] }),
    );
    const text = JSON.stringify(service.getPublicConfig());
    for (const secret of ["very-secret-password", "relay-token-1234567", "relay.example.org", "ts.example.org", "9988", "v1:"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("admin settings report whether secrets exist but never their value or ciphertext", () => {
    const service = ctx.create();
    service.updateServer(DEFAULT_SERVER_ID, serverInput({ serverPassword: "very-secret-password" }));
    service.updateSettings(
      settingsInput({ relayNodes: [{ name: "R", target: "relay.example.org", enabled: true, token: "relay-token-1234567" }] }),
    );
    const view = service.getAdminSettings();
    expect(view).toMatchObject({
      servers: [{ id: DEFAULT_SERVER_ID, hasPassword: true, target: "ts.example.org:9988" }],
      welcomeDefaults: DEFAULT_WELCOME_TEXTS,
    });
    expect((view.relayNodes as unknown[])[0]).toMatchObject({ name: "R", target: "relay.example.org:39087", hasToken: true });
    const text = JSON.stringify(view);
    for (const secret of ["very-secret-password", "relay-token-1234567", "v1:"]) expect(text).not.toContain(secret);
  });

  it("writes an IPv6 relay target with brackets", () => {
    const service = ctx.create();
    service.updateSettings(settingsInput({ relayNodes: [{ name: "R", target: "[2001:db8::1]:40000", enabled: false }] }));
    expect((service.getAdminSettings().relayNodes as Array<{ target: string }>)[0]?.target).toBe("[2001:db8::1]:40000");
  });
});

describe("retention", () => {
  it("tells whoever keeps files of its own the retention now in force, after every save", () => {
    const applied: number[] = [];
    const service = ctx.create(undefined, (retention) => applied.push(retention.logs.days));
    service.updateSettings(settingsInput({ logRetentionDays: 7 }));
    service.updateSettings(settingsInput());
    service.updateSettings(settingsInput({ logRetentionDays: 14 }));
    expect(applied).toEqual([7, 7, 14]);
    expect(service.getAdminSettings().logRetentionDays).toBe(14);
  });

  it("refuses a log retention outside 1 to 365 days without telling anyone", () => {
    const applied: number[] = [];
    const service = ctx.create(undefined, (retention) => applied.push(retention.logs.days));
    expect(rejection(() => service.updateSettings(settingsInput({ logRetentionDays: 0 }))).code).toBe("INVALID_LOG_RETENTION");
    expect(applied).toEqual([]);
  });
});

describe("updateSettings validation", () => {
  const cases: Array<[string, Parameters<typeof settingsInput>[0], string]> = [
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

  it("defaults the identity mint policy and persists admin changes", () => {
    const service = ctx.create();
    expect(service.getIdentityMintPolicy()).toEqual({ maxLevel: 8, concurrency: 2, queueDepth: 20 });
    service.updateSettings(settingsInput({ identityMintMaxLevel: 12, identityMintConcurrency: 4, identityMintQueueDepth: 0 }));
    expect(service.getIdentityMintPolicy()).toEqual({ maxLevel: 12, concurrency: 4, queueDepth: 0 });
    expect(service.getAdminSettings()).toMatchObject({ identityMintMaxLevel: 12, identityMintConcurrency: 4, identityMintQueueDepth: 0 });
  });

  it("rejects an out-of-range identity mint limit", () => {
    const service = ctx.create();
    expect(rejection(() => service.updateSettings(settingsInput({ identityMintMaxLevel: 25 }))).code).toBe("INVALID_IDENTITY_MINT_LEVEL");
  });
});

describe("access mode and the server list", () => {
  it("refuses the server list only mode without a server, and keeps the settings", () => {
    const service = ctx.create();
    service.updateSettings(settingsInput({ accessMode: "open" }));
    service.removeServer(DEFAULT_SERVER_ID);
    expect(rejection(() => service.updateSettings(settingsInput({ accessMode: "fixed" }))).code).toBe("SERVERS_REQUIRED");
    expect(service.getAccessMode()).toBe("open");
  });

  it("keeps the last server while the list is the only way in, but lets open access go without", () => {
    const service = ctx.create();
    service.updateSettings(settingsInput({ accessMode: "fixed" }));
    expect(rejection(() => service.removeServer(DEFAULT_SERVER_ID)).code).toBe("SERVERS_REQUIRED");
    service.updateSettings(settingsInput({ accessMode: "open" }));
    service.removeServer(DEFAULT_SERVER_ID);
    expect(service.listServers()).toEqual([]);
  });
});

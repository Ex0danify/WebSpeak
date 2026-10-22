import { describe, expect, it } from "vitest";
import { MASTER_SECRET, settingsInput } from "../../../test/support/adminService.js";
import type { PersistedRelayNode, PersistedSettings } from "../../infra/persistence/database.js";
import { decryptSecret, encryptSecret } from "../../infra/security/secretCrypto.js";
import { DEFAULT_ACCELERATION_RELAY_PORT } from "../relay/index.js";
import { AdminInputError } from "./adminErrors.js";
import { legacyRelayNodesFromSettings, normalizeRelayNodes, normalizeSettings, toSettingsUpdate } from "./adminSettingsNormalizer.js";

const TOKEN = "relay-token-1234567";

const stored = (overrides: Partial<PersistedSettings> = {}): PersistedSettings => ({
  siteName: "Old",
  welcomeTexts: { en: "en", de: "de" },
  accessMode: "fixed",
  tsHost: "127.0.0.1",
  tsPort: 9987,
  tsPasswordEncrypted: null,
  detectedProtocol: null,
  lastTestAt: null,
  lastTestLatencyMs: null,
  lastTestError: null,
  webRtcEnabled: false,
  webRtcUdpStart: 40000,
  webRtcUdpEnd: 40100,
  identityMintMaxLevel: 8,
  identityMintConcurrency: 2,
  identityMintQueueDepth: 20,
  relayConfigured: false,
  relayEnabled: false,
  relayName: "",
  relayHost: "",
  relayPort: 0,
  relayTokenEncrypted: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const node = (overrides: Partial<PersistedRelayNode> = {}): PersistedRelayNode => ({
  id: "relay-a",
  name: "A",
  enabled: true,
  host: "relay.example.org",
  port: 9000,
  tokenEncrypted: encryptSecret(TOKEN, MASTER_SECRET),
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

function codeOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(AdminInputError);
    return (error as AdminInputError).code;
  }
  throw new Error("expected the action to throw");
}

describe("normalizeSettings", () => {
  it("trims text, parses the target and keeps current values for omitted fields", () => {
    const result = normalizeSettings(settingsInput({ siteName: "  Site  ", welcomeTexts: { en: " hi " } }), stored(), MASTER_SECRET);
    expect(result).toMatchObject({
      siteName: "Site",
      welcomeTexts: { en: "hi", de: "de" },
      tsHost: "ts.example.org",
      tsPort: 9988,
      accessMode: "open",
      webRtcUdpStart: 40000,
      webRtcUdpEnd: 40100,
    });
  });

  const rejects: Array<[string, Parameters<typeof settingsInput>[0], string]> = [
    ["a bad target", { target: "bad target:::" }, "INVALID_TARGET"],
    ["an empty site name", { siteName: "  " }, "INVALID_SITE_NAME"],
    ["a site name over 80", { siteName: "x".repeat(81) }, "INVALID_SITE_NAME"],
    ["an English welcome over 500", { welcomeTexts: { en: "x".repeat(501) } }, "INVALID_WELCOME_TEXT"],
    ["a German welcome over 500", { welcomeTexts: { de: "x".repeat(501) } }, "INVALID_WELCOME_TEXT"],
    ["a welcome over 500 in any other language", { welcomeTexts: { fr: "x".repeat(501) } }, "INVALID_WELCOME_TEXT"],
    ["an unknown access mode", { accessMode: "nope" as never }, "INVALID_ACCESS_MODE"],
    ["a non-boolean webRtcEnabled", { webRtcEnabled: "yes" as never }, "INVALID_WEBRTC_ENABLED"],
    ["a start port below 1024", { webRtcUdpStart: 80 }, "INVALID_WEBRTC_PORT_RANGE"],
    ["an end port above 65535", { webRtcUdpEnd: 70000 }, "INVALID_WEBRTC_PORT_RANGE"],
    ["a start port after the end port", { webRtcUdpStart: 50000, webRtcUdpEnd: 45000 }, "INVALID_WEBRTC_PORT_RANGE"],
    ["a mint level below 1", { identityMintMaxLevel: 0 }, "INVALID_IDENTITY_MINT_LEVEL"],
    ["a mint level above 24", { identityMintMaxLevel: 25 }, "INVALID_IDENTITY_MINT_LEVEL"],
    ["a mint concurrency below 1", { identityMintConcurrency: 0 }, "INVALID_IDENTITY_MINT_CONCURRENCY"],
    ["a mint concurrency above 8", { identityMintConcurrency: 9 }, "INVALID_IDENTITY_MINT_CONCURRENCY"],
    ["a mint queue depth above 100", { identityMintQueueDepth: 101 }, "INVALID_IDENTITY_MINT_QUEUE_DEPTH"],
  ];
  it.each(rejects)("rejects %s", (_name, overrides, code) => {
    expect(codeOf(() => normalizeSettings(settingsInput(overrides), stored(), MASTER_SECRET))).toBe(code);
  });

  it("rejects a welcome-text map that grows past 16 languages over repeated requests", () => {
    let current = stored({ welcomeTexts: {} });
    let code = "";
    for (let request = 0; request < 20 && !code; request += 1) {
      const welcomeTexts = Object.fromEntries(
        Array.from({ length: 8 }, (_, index) => [`x${String.fromCharCode(97 + request)}${String.fromCharCode(97 + index)}`, "text"]),
      );
      try {
        current = stored({ welcomeTexts: normalizeSettings(settingsInput({ welcomeTexts }), current, MASTER_SECRET).welcomeTexts });
      } catch (error) {
        code = (error as AdminInputError).code;
      }
    }
    expect(code).toBe("INVALID_WELCOME_TEXT");
  });

  it("keeps a language's welcome text when the form omits it and clears it when the form sends an empty one", () => {
    const kept = normalizeSettings(settingsInput({ welcomeTexts: { fr: "salut" } }), stored(), MASTER_SECRET);
    expect(kept.welcomeTexts).toEqual({ en: "en", de: "de", fr: "salut" });
    expect(normalizeSettings(settingsInput({ welcomeTexts: { de: "  " } }), stored(), MASTER_SECRET).welcomeTexts).toEqual({ en: "en" });
    expect(normalizeSettings(settingsInput(), stored(), MASTER_SECRET).welcomeTexts).toEqual({ en: "en", de: "de" });
  });

  it("keeps current mint limits for omitted fields and accepts a zero queue depth", () => {
    const current = stored({ identityMintMaxLevel: 12, identityMintConcurrency: 4, identityMintQueueDepth: 50 });
    expect(normalizeSettings(settingsInput(), current, MASTER_SECRET)).toMatchObject({
      identityMintMaxLevel: 12,
      identityMintConcurrency: 4,
      identityMintQueueDepth: 50,
    });
    expect(normalizeSettings(settingsInput({ identityMintQueueDepth: 0 }), current, MASTER_SECRET).identityMintQueueDepth).toBe(0);
  });

  it("locks the UDP range while WebRTC is enabled", () => {
    const current = stored({ webRtcEnabled: true });
    expect(codeOf(() => normalizeSettings(settingsInput({ webRtcUdpStart: 41000, webRtcUdpEnd: 41100 }), current, MASTER_SECRET))).toBe(
      "WEBRTC_PORT_LOCKED",
    );
    expect(normalizeSettings(settingsInput({ webRtcEnabled: true }), current, MASTER_SECRET).webRtcUdpStart).toBe(40000);
  });

  it("keeps, replaces and removes the server password", () => {
    const current = stored({ tsPasswordEncrypted: "enc" });
    expect(normalizeSettings(settingsInput(), current, MASTER_SECRET).tsPasswordEncrypted).toBe("enc");
    expect(normalizeSettings(settingsInput({ passwordAction: "remove" }), current, MASTER_SECRET).tsPasswordEncrypted).toBeNull();
    const replaced = normalizeSettings(settingsInput({ serverPassword: "secret" }), current, MASTER_SECRET).tsPasswordEncrypted;
    expect(decryptSecret(replaced!, MASTER_SECRET)).toBe("secret");
    expect(
      normalizeSettings(settingsInput({ passwordAction: "replace", serverPassword: "" }), current, MASTER_SECRET).tsPasswordEncrypted,
    ).toBeNull();
  });

  it("replaces the legacy relay fields and validates them", () => {
    const result = normalizeSettings(
      settingsInput({
        relaySettingsAction: "replace",
        relayEnabled: true,
        relayName: " R ",
        relayTarget: "relay.example.org",
        relayToken: TOKEN,
      }),
      stored(),
      MASTER_SECRET,
    );
    expect(result).toMatchObject({
      relayConfigured: true,
      relayEnabled: true,
      relayName: "R",
      relayHost: "relay.example.org",
      relayPort: DEFAULT_ACCELERATION_RELAY_PORT,
    });
    const enabled = {
      relaySettingsAction: "replace",
      relayEnabled: true,
      relayName: "R",
      relayTarget: "relay.example.org",
      relayToken: TOKEN,
    } as const;
    expect(codeOf(() => normalizeSettings(settingsInput({ ...enabled, relayName: "" }), stored(), MASTER_SECRET))).toBe(
      "INVALID_RELAY_NAME",
    );
    expect(codeOf(() => normalizeSettings(settingsInput({ ...enabled, relayTarget: "" }), stored(), MASTER_SECRET))).toBe(
      "INVALID_RELAY_TARGET",
    );
    expect(codeOf(() => normalizeSettings(settingsInput({ ...enabled, relayTarget: "bad target:::" }), stored(), MASTER_SECRET))).toBe(
      "INVALID_RELAY_TARGET",
    );
    expect(codeOf(() => normalizeSettings(settingsInput({ ...enabled, relayToken: undefined }), stored(), MASTER_SECRET))).toBe(
      "INVALID_RELAY_TOKEN",
    );
  });

  it("clears the legacy relay fields on remove", () => {
    const current = stored({
      relayConfigured: true,
      relayEnabled: true,
      relayName: "R",
      relayHost: "h",
      relayPort: 1,
      relayTokenEncrypted: "t",
    });
    expect(normalizeSettings(settingsInput({ relaySettingsAction: "remove" }), current, MASTER_SECRET)).toMatchObject({
      relayConfigured: true,
      relayEnabled: false,
      relayName: "",
      relayHost: "",
      relayPort: DEFAULT_ACCELERATION_RELAY_PORT,
      relayTokenEncrypted: null,
    });
  });

  it("derives the relay fields from the first enabled node when nodes are given", () => {
    const nodes = [node({ id: "relay-x", enabled: false }), node({ id: "relay-y", name: "Y", host: "y.example.org" })];
    expect(normalizeSettings(settingsInput(), stored(), MASTER_SECRET, nodes)).toMatchObject({
      relayConfigured: true,
      relayEnabled: true,
      relayName: "Y",
      relayHost: "y.example.org",
    });
    expect(normalizeSettings(settingsInput(), stored({ relayName: "old" }), MASTER_SECRET, [])).toMatchObject({
      relayConfigured: false,
      relayEnabled: false,
      relayName: "",
      relayHost: "",
      relayTokenEncrypted: null,
    });
  });
});

describe("normalizeRelayNodes", () => {
  const input = (overrides = {}) => ({ name: "Relay", target: "relay.example.org", enabled: true, token: TOKEN, ...overrides });

  it("builds persisted nodes with a generated id and parsed target", () => {
    const [result] = normalizeRelayNodes([input({ name: " Relay " })], [], MASTER_SECRET);
    expect(result).toMatchObject({ name: "Relay", enabled: true, host: "relay.example.org", port: DEFAULT_ACCELERATION_RELAY_PORT });
    expect(result!.id).toMatch(/^relay-[0-9a-f]{16}$/);
    expect(decryptSecret(result!.tokenEncrypted!, MASTER_SECRET)).toBe(TOKEN);
  });

  it("keeps the previous token and createdAt for a known id", () => {
    const previous = node();
    const [result] = normalizeRelayNodes([input({ id: "relay-a", token: undefined })], [previous], MASTER_SECRET);
    expect(result).toMatchObject({ id: "relay-a", tokenEncrypted: previous.tokenEncrypted, createdAt: previous.createdAt });
    expect(result!.updatedAt).not.toBe(previous.updatedAt);
  });

  it("removes a token and refuses to enable a node without one", () => {
    const [off] = normalizeRelayNodes([input({ id: "relay-a", enabled: false, tokenAction: "remove" })], [node()], MASTER_SECRET);
    expect(off!.tokenEncrypted).toBeNull();
    expect(codeOf(() => normalizeRelayNodes([input({ id: "relay-a", tokenAction: "remove" })], [node()], MASTER_SECRET))).toBe(
      "INVALID_RELAY_TOKEN",
    );
  });

  it("rejects too many nodes, a non-array, duplicate ids, bad names and targets", () => {
    expect(
      codeOf(() =>
        normalizeRelayNodes(
          Array.from({ length: 17 }, () => input()),
          [],
          MASTER_SECRET,
        ),
      ),
    ).toBe("INVALID_RELAY_NODES");
    expect(codeOf(() => normalizeRelayNodes("x" as never, [], MASTER_SECRET))).toBe("INVALID_RELAY_NODES");
    expect(codeOf(() => normalizeRelayNodes([input({ id: "relay-a" }), input({ id: "relay-a" })], [], MASTER_SECRET))).toBe(
      "INVALID_RELAY_ID",
    );
    expect(codeOf(() => normalizeRelayNodes([input({ name: "" })], [], MASTER_SECRET))).toBe("INVALID_RELAY_NAME");
    expect(codeOf(() => normalizeRelayNodes([input({ target: "" })], [], MASTER_SECRET))).toBe("INVALID_RELAY_TARGET");
  });

  it("rejects an enabled node whose stored token cannot be decrypted", () => {
    expect(
      codeOf(() => normalizeRelayNodes([input({ id: "relay-a", token: undefined })], [node({ tokenEncrypted: "garbage" })], MASTER_SECRET)),
    ).toBe("INVALID_RELAY_TOKEN");
  });
});

describe("legacyRelayNodesFromSettings", () => {
  const update = toSettingsUpdate(
    stored({
      relayConfigured: true,
      relayEnabled: true,
      relayName: "R",
      relayHost: "relay.example.org",
      relayPort: 9100,
      relayTokenEncrypted: "tok",
    }),
  );

  it("returns no nodes when the relay is unconfigured, hostless or tokenless", () => {
    expect(legacyRelayNodesFromSettings({ ...update, relayConfigured: false }, [])).toEqual([]);
    expect(legacyRelayNodesFromSettings({ ...update, relayHost: "" }, [])).toEqual([]);
    expect(legacyRelayNodesFromSettings({ ...update, relayTokenEncrypted: null }, [])).toEqual([]);
  });

  it("builds a default node, or reuses the id and createdAt of the first existing node", () => {
    expect(legacyRelayNodesFromSettings(update, [])[0]).toMatchObject({
      id: "relay-default",
      name: "R",
      enabled: true,
      host: "relay.example.org",
      port: 9100,
      tokenEncrypted: "tok",
    });
    expect(legacyRelayNodesFromSettings(update, [node()])[0]).toMatchObject({ id: "relay-a", createdAt: node().createdAt });
    expect(legacyRelayNodesFromSettings({ ...update, relayName: "" }, [])[0]!.name).toBe("Relay acceleration");
  });
});

describe("toSettingsUpdate", () => {
  it("copies the writable fields and drops the read-only ones", () => {
    const result = toSettingsUpdate(stored());
    expect(result).not.toHaveProperty("updatedAt");
    expect(result).not.toHaveProperty("lastTestAt");
    expect(result).not.toHaveProperty("detectedProtocol");
    expect(result).toMatchObject({ siteName: "Old", tsHost: "127.0.0.1", webRtcUdpEnd: 40100 });
  });
});

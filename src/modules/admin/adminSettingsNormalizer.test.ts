import { describe, expect, it } from "vitest";
import { MASTER_SECRET, settingsInput } from "../../../test/support/adminService.js";
import type { PersistedRelayNode, PersistedSettings } from "../../infra/persistence/database.js";
import { decryptSecret, encryptSecret } from "../../infra/security/secretCrypto.js";
import { DEFAULT_ACCELERATION_RELAY_PORT } from "../relay/index.js";
import { AdminInputError } from "./adminErrors.js";
import { normalizeRelayNodes, normalizeSettings, toSettingsUpdate } from "./adminSettingsNormalizer.js";

const TOKEN = "relay-token-1234567";

const stored = (overrides: Partial<PersistedSettings> = {}): PersistedSettings => ({
  siteName: "Old",
  welcomeTexts: { en: "en", de: "de" },
  accessMode: "fixed",
  webRtcEnabled: false,
  webRtcUdpStart: 40000,
  webRtcUdpEnd: 40100,
  identityMintMaxLevel: 8,
  identityMintConcurrency: 2,
  identityMintQueueDepth: 20,
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
  it("trims text and keeps current values for omitted fields", () => {
    const result = normalizeSettings(settingsInput({ siteName: "  Site  ", welcomeTexts: { en: " hi " } }), stored());
    expect(result).toMatchObject({
      siteName: "Site",
      welcomeTexts: { en: "hi", de: "de" },
      accessMode: "open",
      webRtcUdpStart: 40000,
      webRtcUdpEnd: 40100,
    });
  });

  const rejects: Array<[string, Parameters<typeof settingsInput>[0], string]> = [
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
    expect(codeOf(() => normalizeSettings(settingsInput(overrides), stored()))).toBe(code);
  });

  it("rejects a welcome-text map that grows past 16 languages over repeated requests", () => {
    let current = stored({ welcomeTexts: {} });
    let code = "";
    for (let request = 0; request < 20 && !code; request += 1) {
      const welcomeTexts = Object.fromEntries(
        Array.from({ length: 8 }, (_, index) => [`x${String.fromCharCode(97 + request)}${String.fromCharCode(97 + index)}`, "text"]),
      );
      try {
        current = stored({ welcomeTexts: normalizeSettings(settingsInput({ welcomeTexts }), current).welcomeTexts });
      } catch (error) {
        code = (error as AdminInputError).code;
      }
    }
    expect(code).toBe("INVALID_WELCOME_TEXT");
  });

  it("keeps a language's welcome text when the form omits it and clears it when the form sends an empty one", () => {
    const kept = normalizeSettings(settingsInput({ welcomeTexts: { fr: "salut" } }), stored());
    expect(kept.welcomeTexts).toEqual({ en: "en", de: "de", fr: "salut" });
    expect(normalizeSettings(settingsInput({ welcomeTexts: { de: "  " } }), stored()).welcomeTexts).toEqual({ en: "en" });
    expect(normalizeSettings(settingsInput(), stored()).welcomeTexts).toEqual({ en: "en", de: "de" });
  });

  it("keeps current mint limits for omitted fields and accepts a zero queue depth", () => {
    const current = stored({ identityMintMaxLevel: 12, identityMintConcurrency: 4, identityMintQueueDepth: 50 });
    expect(normalizeSettings(settingsInput(), current)).toMatchObject({
      identityMintMaxLevel: 12,
      identityMintConcurrency: 4,
      identityMintQueueDepth: 50,
    });
    expect(normalizeSettings(settingsInput({ identityMintQueueDepth: 0 }), current).identityMintQueueDepth).toBe(0);
  });

  it("locks the UDP range while WebRTC is enabled", () => {
    const current = stored({ webRtcEnabled: true });
    expect(codeOf(() => normalizeSettings(settingsInput({ webRtcUdpStart: 41000, webRtcUdpEnd: 41100 }), current))).toBe(
      "WEBRTC_PORT_LOCKED",
    );
    expect(normalizeSettings(settingsInput({ webRtcEnabled: true }), current).webRtcUdpStart).toBe(40000);
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

describe("toSettingsUpdate", () => {
  it("copies the writable fields and drops the read-only ones", () => {
    const result = toSettingsUpdate(stored());
    expect(result).not.toHaveProperty("updatedAt");
    expect(result).toMatchObject({ siteName: "Old", webRtcUdpEnd: 40100 });
  });
});

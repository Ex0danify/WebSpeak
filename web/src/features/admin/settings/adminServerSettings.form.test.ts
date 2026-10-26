import { registerAdminStores } from "@/features/admin/shell/adminStores";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRelayNode, DEFAULT_WELCOME_TEXTS, mapRelayNodes, welcomeLanguageOptions } from "@/features/admin/settings/adminServerForm";
import { useAdminServerSettingsStore } from "@/features/admin/settings/adminServerSettings";
import { LANGUAGES } from "@/shared/i18n/languages";
import { useAdminSessionStore } from "@/features/admin/core/adminSession";

vi.mock("vue-router", () => ({ useRoute: () => ({ path: "/admin" }), useRouter: () => ({ replace: vi.fn() }) }));

function setup() {
  const getJson = vi.fn();
  const sendJson = vi.fn();
  Object.assign(useAdminSessionStore(), { getJson, sendJson, screen: "admin" });
  return { st: useAdminServerSettingsStore(), getJson, sendJson };
}

beforeEach(() => {
  setActivePinia(createPinia());
  registerAdminStores();
});

describe("mapRelayNodes / createRelayNode", () => {
  it("keeps only well-formed nodes and never carries a token over", () => {
    const nodes = mapRelayNodes([{ id: "a", name: "A", target: "h:1", enabled: true, hasToken: true }, { id: 1 }, null, "x"]);
    expect(nodes).toEqual([{ id: "a", name: "A", enabled: true, target: "h:1", token: "", tokenAction: "keep", hasToken: true }]);
    expect(mapRelayNodes("nope")).toEqual([]);
  });

  it("creates a blank node that must be given a token", () => {
    const node = createRelayNode();
    expect(node.id).toMatch(/^relay-new-/);
    expect(node).toMatchObject({ enabled: false, tokenAction: "replace", hasToken: false });
  });
});

describe("useAdminServerSettingsStore", () => {
  it("loadServerSettings fills defaults for what the response leaves out", async () => {
    const s = setup();
    s.getJson.mockResolvedValue({
      accessMode: "open",
      welcomeTexts: { de: "Hallo" },
      webRtcUdpStart: 0,
      identityMintMaxLevel: 12,
      identityMintQueueDepth: 0,
      relayNodes: [{ id: "r", name: "R", target: "t" }],
    });
    await s.st.loadServerSettings();
    expect(s.getJson).toHaveBeenCalledWith("/api/admin/server");
    expect(s.st.serverForm).toMatchObject({
      accessMode: "open",
      welcomeTexts: { de: "Hallo" },
      webRtcUdpStart: 40000,
      identityMintMaxLevel: 12,
      identityMintConcurrency: 2,
      identityMintQueueDepth: 0,
    });
    expect(s.st.serverForm.relayNodes).toHaveLength(1);
    expect(s.st.serverForm.welcomeDefaults.en).toBe(DEFAULT_WELCOME_TEXTS.en);
  });

  it("edits the welcome text of the selected language", () => {
    const s = setup();
    s.st.welcomeLanguage = "de";
    s.st.selectedWelcomeText = "Hallo";
    expect(s.st.serverForm.welcomeTexts.de).toBe("Hallo");
    expect(s.st.selectedWelcomeLanguageLabel).toBe("Deutsch");
    expect(s.st.selectedWelcomeDefault).toBe(DEFAULT_WELCOME_TEXTS.de);
  });

  it("offers every discovered language and falls back to the English default for one without a template", () => {
    const s = setup();
    expect(welcomeLanguageOptions.map((option) => option.value)).toEqual(LANGUAGES.map((info) => info.code));
    s.st.welcomeLanguage = "xx";
    expect(s.st.selectedWelcomeDefault).toBe(DEFAULT_WELCOME_TEXTS.en);
  });

  it("adds a node without saving it, and removing one saves", async () => {
    const s = setup();
    s.st.addRelayNode();
    expect(s.st.serverForm.relayNodes).toHaveLength(1);
    await Promise.resolve();
    expect(s.sendJson).not.toHaveBeenCalled();
    s.st.removeRelayNode(0);
    expect(s.st.serverForm.relayNodes).toHaveLength(0);
  });
});

describe("useAdminServerSettingsStore (view)", () => {
  it("exposes the WebRTC range as text", () => {
    const s = setup();
    expect(s.st.webrtcPortRangeText).toBe("40000–40099");
  });
});

import { registerAdminStores } from "@/features/admin/adminStores";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useI18n } from "@/shared/i18n/useI18n";
import { createRelayNode, DEFAULT_WELCOME_TEXTS, mapRelayNodes, welcomeLanguageOptions } from "@/features/admin/adminServerForm";
import { useAdminServerSettingsStore } from "@/features/admin/adminServerSettings";
import { LANGUAGES } from "@/shared/i18n/languages";
import { useAdminOverviewStore } from "@/features/admin/adminOverview";
import { useAdminSessionStore } from "@/features/admin/adminSession";

vi.mock("vue-router", () => ({ useRoute: () => ({ path: "/admin" }), useRouter: () => ({ replace: vi.fn() }) }));

const { t } = useI18n();

function setup() {
  const admin = useAdminSessionStore();
  const getJson = vi.fn();
  const sendJson = vi.fn();
  const notify = vi.fn();
  // The stores look these up on each other at call time, so replacing them observes the calls.
  Object.assign(admin, { getJson, sendJson, notify, screen: "admin" });
  const loadOverview = vi.fn(async () => {});
  Object.assign(useAdminOverviewStore(), { loadOverview });
  return { st: useAdminServerSettingsStore(), admin, getJson, sendJson, loadOverview, notify };
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

  it("marks relay settings touched when nodes are added or removed", () => {
    const s = setup();
    s.st.addRelayNode();
    expect(s.st.serverForm.relayNodes).toHaveLength(1);
    expect(s.st.serverForm.relaySettingsTouched).toBe(true);
    s.st.serverForm.relaySettingsTouched = false;
    s.st.removeRelayNode(0);
    expect(s.st.serverForm.relayNodes).toHaveLength(0);
    expect(s.st.serverForm.relaySettingsTouched).toBe(true);
  });

  it("opens the port notice only when WebRTC is switched on", () => {
    const s = setup();
    s.st.handleWebRtcToggle();
    expect(s.st.webrtcPortNoticeOpen).toBe(false);
    s.st.serverForm.webRtcEnabled = true;
    s.st.handleWebRtcToggle();
    expect(s.st.webrtcPortNoticeOpen).toBe(true);
  });

  it("saveServerSettings sends the payload, applies the response and announces it", async () => {
    const s = setup();
    s.st.serverForm.identityMintMaxLevel = 10;
    s.st.serverForm.identityMintConcurrency = 3;
    s.st.serverForm.identityMintQueueDepth = 0;
    s.st.serverForm.relayNodes = [
      { id: "n", name: "N", enabled: true, target: "t", token: "tok", tokenAction: "replace", hasToken: false },
    ];
    s.sendJson.mockResolvedValue({ settings: { siteName: "Saved", accessMode: "open" } });
    await s.st.saveServerSettings();
    const [url, method, body] = s.sendJson.mock.calls[0];
    expect([url, method]).toEqual(["/api/admin/server", "PUT"]);
    expect(body).toMatchObject({
      identityMintMaxLevel: 10,
      identityMintConcurrency: 3,
      identityMintQueueDepth: 0,
      relayNodes: [{ id: "n", tokenAction: "replace", token: "tok" }],
    });
    expect(s.st.serverForm).toMatchObject({ siteName: "Saved", accessMode: "open" });
    expect(body).not.toHaveProperty("target");
    expect(s.loadOverview).toHaveBeenCalled();
    expect(s.notify).toHaveBeenCalledWith(t("settingsSaved"));
    expect(s.admin.submitting).toBe(false);
  });

  it("saveServerSettings reports a failure in the banner", async () => {
    const s = setup();
    s.sendJson.mockRejectedValue({ code: "INVALID_WEBRTC_PORT_RANGE" });
    await s.st.saveServerSettings();
    expect(s.admin.errorMessage).toBe(s.admin.errorText("INVALID_WEBRTC_PORT_RANGE"));
    expect(s.notify).not.toHaveBeenCalled();
    expect(s.admin.submitting).toBe(false);
  });

  it("exposes the WebRTC range as text", () => {
    const s = setup();
    expect(s.st.webrtcPortRangeText).toBe("40000–40099");
  });
});

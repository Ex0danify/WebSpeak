import { nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useI18n } from "@/shared/i18n/useI18n";
import { createAdminFormat } from "./adminFormat";
import { createRelayNode, DEFAULT_WELCOME_TEXTS, mapRelayNodes, useAdminServerSettingsStore } from "./adminServerSettings";
import { useAdminOverviewStore } from "./adminOverview";
import { useAdminSessionStore } from "./adminSession";

vi.mock("vue-router", () => ({ useRoute: () => ({ path: "/admin" }), useRouter: () => ({ replace: vi.fn() }) }));

const { language, t } = useI18n();
const { connectionFailureText } = createAdminFormat(language, t);

function setup(adminScreen = true) {
  const admin = useAdminSessionStore();
  const getJson = vi.fn();
  const sendJson = vi.fn();
  const notify = vi.fn();
  // The stores look these up on each other at call time, so replacing them observes the calls.
  Object.assign(admin, { getJson, sendJson, notify, screen: adminScreen ? "admin" : "login" });
  const loadOverview = vi.fn(async () => {});
  Object.assign(useAdminOverviewStore(), { loadOverview });
  return { st: useAdminServerSettingsStore(), admin, getJson, sendJson, loadOverview, notify };
}

beforeEach(() => setActivePinia(createPinia()));

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
  it("loadServerSettings splits the target and fills defaults", async () => {
    const s = setup();
    s.getJson.mockResolvedValue({ target: "ts.example.com:9988", accessMode: "open", welcomeTextDe: "Hallo", webRtcUdpStart: 0, relayNodes: [{ id: "r", name: "R", target: "t" }] });
    await s.st.loadServerSettings();
    expect(s.getJson).toHaveBeenCalledWith("/api/admin/server");
    expect(s.st.serverForm).toMatchObject({ address: "ts.example.com", port: "9988", accessMode: "open", welcomeTextDe: "Hallo", webRtcUdpStart: 40000, passwordAction: "keep" });
    expect(s.st.serverForm.relayNodes).toHaveLength(1);
    expect(s.st.serverForm.welcomeDefaults.en).toBe(DEFAULT_WELCOME_TEXTS.en);
  });

  it("edits the welcome text of the selected language", () => {
    const s = setup();
    s.st.welcomeLanguage = "de";
    s.st.selectedWelcomeText = "Hallo";
    expect(s.st.serverForm.welcomeTextDe).toBe("Hallo");
    expect(s.st.selectedWelcomeLanguageLabel).toBe("Deutsch");
    expect(s.st.selectedWelcomeDefault).toBe(DEFAULT_WELCOME_TEXTS.de);
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
    s.st.serverForm.address = "h";
    s.st.serverForm.port = "1";
    s.st.serverForm.passwordAction = "replace";
    s.st.serverForm.serverPassword = "pw";
    s.st.serverForm.relayNodes = [{ id: "n", name: "N", enabled: true, target: "t", token: "tok", tokenAction: "replace", hasToken: false }];
    s.sendJson.mockResolvedValue({ settings: { target: "h2:2", siteName: "Saved" } });
    await s.st.saveServerSettings();
    const [url, method, body] = s.sendJson.mock.calls[0];
    expect([url, method]).toEqual(["/api/admin/server", "PUT"]);
    expect(body).toMatchObject({ target: expect.stringContaining("h"), serverPassword: "pw", passwordAction: "replace", relayNodes: [{ id: "n", tokenAction: "replace", token: "tok" }] });
    expect(s.st.serverForm).toMatchObject({ address: "h2", port: "2", siteName: "Saved", serverPassword: "", passwordAction: "keep" });
    expect(s.loadOverview).toHaveBeenCalled();
    expect(s.notify).toHaveBeenCalledWith(t("settingsSaved"));
    expect(s.admin.submitting).toBe(false);
  });

  it("saveServerSettings does not send a password unless it is being replaced", async () => {
    const s = setup();
    s.st.serverForm.serverPassword = "stale";
    s.sendJson.mockResolvedValue({ settings: {} });
    await s.st.saveServerSettings();
    expect(s.sendJson.mock.calls[0][2].serverPassword).toBeUndefined();
  });

  it("saveServerSettings reports a failure in the banner", async () => {
    const s = setup();
    s.sendJson.mockRejectedValue({ code: "INVALID_WEBRTC_PORT_RANGE" });
    await s.st.saveServerSettings();
    expect(s.admin.errorMessage).toBe(s.admin.errorText("INVALID_WEBRTC_PORT_RANGE"));
    expect(s.notify).not.toHaveBeenCalled();
    expect(s.admin.submitting).toBe(false);
  });

  it("testServerConnection records the result and the latency", async () => {
    const s = setup();
    s.sendJson.mockResolvedValue({ ok: true, latencyMs: 12 });
    await s.st.testServerConnection();
    expect(s.sendJson.mock.calls[0][0]).toBe("/api/admin/server/test");
    expect(s.st.testResult?.ok).toBe(true);
    expect(s.st.serverForm.lastTestLatencyMs).toBe(12);
    expect(s.st.serverForm.lastTestAt).not.toBeNull();
    expect(s.loadOverview).toHaveBeenCalled();
    expect(s.st.testing).toBe(false);
  });

  it("testServerConnection turns a thrown error into a failed result", async () => {
    const s = setup();
    s.sendJson.mockRejectedValue({ code: "TIMEOUT" });
    await s.st.testServerConnection();
    expect(s.st.testResult).toEqual({ ok: false, code: "TIMEOUT" });
    expect(s.st.serverForm.lastTestLatencyMs).toBeNull();
    expect(s.st.testResultText).toContain(connectionFailureText("TIMEOUT"));
  });

  it("clears a stale test result when the target is edited, but only on the open console", async () => {
    const open = setup(true);
    open.st.testResult = { ok: true };
    open.st.serverForm.address = "other";
    await nextTick();
    expect(open.st.testResult).toBeNull();

    const closed = setup(false);
    closed.st.testResult = { ok: true };
    closed.st.serverForm.address = "other";
    await nextTick();
    expect(closed.st.testResult).toEqual({ ok: true });
  });

  it("exposes the WebRTC range as text", () => {
    const s = setup();
    expect(s.st.webrtcPortRangeText).toBe("40000–40099");
  });
});

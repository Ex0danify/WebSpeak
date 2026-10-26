import { registerAdminStores } from "@/features/admin/shell/adminStores";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useI18n } from "@/shared/i18n/useI18n";
import { createRelayNode, DEFAULT_WELCOME_TEXTS, mapRelayNodes, welcomeLanguageOptions } from "@/features/admin/settings/adminServerForm";
import { useAdminServerSettingsStore } from "@/features/admin/settings/adminServerSettings";
import { LANGUAGES } from "@/shared/i18n/languages";
import { useAdminFeedbackStore } from "@/features/admin/core/adminFeedback";
import { useAdminOverviewStore } from "@/features/admin/dashboard/adminOverview";
import { useAdminSessionStore } from "@/features/admin/core/adminSession";

vi.mock("vue-router", () => ({ useRoute: () => ({ path: "/admin" }), useRouter: () => ({ replace: vi.fn() }) }));

const { t } = useI18n();

function setup() {
  const admin = useAdminSessionStore();
  const getJson = vi.fn();
  const sendJson = vi.fn();
  const notify = vi.fn();
  // The stores look these up on each other at call time, so replacing them observes the calls.
  const feedback = useAdminFeedbackStore();
  Object.assign(admin, { getJson, sendJson, screen: "admin" });
  Object.assign(feedback, { notify });
  const loadOverview = vi.fn(async () => {});
  Object.assign(useAdminOverviewStore(), { loadOverview });
  return { st: useAdminServerSettingsStore(), admin, feedback, getJson, sendJson, loadOverview, notify };
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

  it("opens the port notice only when WebRTC is switched on", () => {
    const s = setup();
    s.st.handleWebRtcToggle();
    expect(s.st.webrtcPortNoticeOpen).toBe(false);
    s.st.serverForm.webRtcEnabled = true;
    s.st.handleWebRtcToggle();
    expect(s.st.webrtcPortNoticeOpen).toBe(true);
  });
});

/** What `getAdminSettings` answers, with the given fields changed. */
function settingsAnswer(changes: Record<string, unknown> = {}) {
  return {
    accessMode: "fixed",
    siteName: "WebSpeak",
    welcomeTexts: {},
    welcomeDefaults: DEFAULT_WELCOME_TEXTS,
    webRtcEnabled: false,
    webRtcUdpStart: 40000,
    webRtcUdpEnd: 40099,
    identityMintMaxLevel: 8,
    identityMintConcurrency: 2,
    identityMintQueueDepth: 20,
    relayNodes: [],
    internalPort: 3000,
    ...changes,
  };
}

async function loaded(changes: Record<string, unknown> = {}) {
  const s = setup();
  s.getJson.mockResolvedValue(settingsAnswer(changes));
  await s.st.loadServerSettings();
  return s;
}

describe("autosave", () => {
  it("sends the whole settings document and applies the answer", async () => {
    const s = await loaded();
    s.st.serverForm.siteName = "Night Owls";
    s.sendJson.mockResolvedValue({ settings: settingsAnswer({ siteName: "Night Owls" }) });
    await s.st.scheduleSave("access");
    expect(s.sendJson).toHaveBeenCalledTimes(1);
    const [url, method, body] = s.sendJson.mock.calls[0];
    expect([url, method]).toEqual(["/api/admin/server", "PUT"]);
    expect(body).toEqual({
      accessMode: "fixed",
      siteName: "Night Owls",
      welcomeTexts: {},
      webRtcEnabled: false,
      webRtcUdpStart: 40000,
      webRtcUdpEnd: 40099,
      identityMintMaxLevel: 8,
      identityMintConcurrency: 2,
      identityMintQueueDepth: 20,
      relayNodes: [],
    });
    expect(s.st.statuses.access.state).toBe("saved");
    expect(s.st.statuses.advanced.state).toBe("idle");
    // The field that was saved says so, and no other does.
    expect(s.st.fieldStatus("siteName").state).toBe("saved");
    expect(s.st.fieldStatus("identityMintMaxLevel").state).toBe("idle");
    expect(s.loadOverview).toHaveBeenCalled();
    expect(s.notify).not.toHaveBeenCalled();
  });

  it("sends nothing before the settings are loaded", async () => {
    const s = setup();
    s.st.serverForm.accessMode = "open";
    await s.st.scheduleSave("access");
    expect(s.sendJson).not.toHaveBeenCalled();
  });

  it("sends nothing when the form says what the gateway keeps", async () => {
    const s = await loaded();
    await s.st.scheduleSave("access");
    expect(s.sendJson).not.toHaveBeenCalled();
    expect(s.st.statuses.access.state).toBe("idle");
  });

  it("does not send a cleared welcome text that was never saved", async () => {
    const s = await loaded();
    s.st.serverForm.welcomeTexts = { de: "" };
    await s.st.scheduleSave("access");
    expect(s.sendJson).not.toHaveBeenCalled();
  });

  it("holds back an invalid value and still saves the rest", async () => {
    const s = await loaded({ identityMintMaxLevel: 12 });
    s.st.serverForm.identityMintMaxLevel = 0;
    s.st.serverForm.accessMode = "open";
    s.st.serverForm.webRtcUdpStart = 50000;
    s.st.serverForm.webRtcUdpEnd = 45000;
    s.sendJson.mockResolvedValue({ settings: settingsAnswer({ accessMode: "open", identityMintMaxLevel: 12 }) });
    await s.st.scheduleSave("access");
    expect(s.sendJson.mock.calls[0][2]).toMatchObject({
      accessMode: "open",
      identityMintMaxLevel: 12,
      webRtcUdpStart: 40000,
      webRtcUdpEnd: 40099,
    });
    expect(Object.keys(s.st.issues).sort()).toEqual(["identityMintMaxLevel", "webRtcUdpEnd"]);
    expect(s.st.issueText("identityMintMaxLevel")).toBe(t("issueNumber", { min: 1, max: 24 }));
    expect(s.st.issueText("siteName")).toBe("");
    // The person's own values stay in the form.
    expect(s.st.serverForm).toMatchObject({ identityMintMaxLevel: 0, webRtcUdpStart: 50000, webRtcUdpEnd: 45000 });
  });

  it("holds back an empty site name", async () => {
    const s = await loaded({ siteName: "Old" });
    s.st.serverForm.siteName = "";
    await s.st.scheduleSave("access");
    expect(s.sendJson).not.toHaveBeenCalled();
    expect(s.st.issueText("siteName")).toBe(t("issueSiteName"));
    expect(s.st.serverForm.siteName).toBe("");
  });

  it("clears a hint once the value is valid again", async () => {
    const s = await loaded({ siteName: "Old" });
    s.st.serverForm.siteName = "";
    await s.st.scheduleSave("access");
    s.st.serverForm.siteName = "Old";
    await s.st.scheduleSave("access");
    expect(s.st.issueText("siteName")).toBe("");
  });

  it("saves a relay node once it is complete and leaves out one that is not", async () => {
    const s = await loaded();
    s.st.addRelayNode();
    await s.st.scheduleSave("relay");
    expect(s.sendJson).not.toHaveBeenCalled();
    expect(s.st.issues).toEqual({});

    const node = s.st.serverForm.relayNodes[0]!;
    node.name = "Frankfurt";
    await s.st.scheduleSave("relay");
    expect(s.sendJson).not.toHaveBeenCalled();
    expect(s.st.issueText(`relay:${node.id}:target`)).toBe(t("issueRelayTarget"));

    node.target = "relay.example.com:9987";
    node.token = "a-token-of-16-chars";
    s.sendJson.mockResolvedValue({
      settings: settingsAnswer({
        relayNodes: [{ id: node.id, name: "Frankfurt", target: "relay.example.com:9987", enabled: false, hasToken: true }],
      }),
    });
    await s.st.scheduleSave("relay");
    expect(s.sendJson.mock.calls[0][2].relayNodes).toEqual([
      {
        id: node.id,
        name: "Frankfurt",
        target: "relay.example.com:9987",
        enabled: false,
        tokenAction: "replace",
        token: "a-token-of-16-chars",
      },
    ]);
    expect(s.st.issues).toEqual({});
    // The token is not kept, the node only knows it has one.
    expect(s.st.serverForm.relayNodes[0]).toMatchObject({ token: "", tokenAction: "keep", hasToken: true });
  });

  it("sends the confirmed version of a saved node that was edited into an incomplete one", async () => {
    const saved = { id: "relay-a", name: "A", target: "a.example.com:9987", enabled: true, hasToken: true };
    const s = await loaded({ relayNodes: [saved] });
    s.st.serverForm.relayNodes[0]!.name = "";
    s.st.serverForm.accessMode = "open";
    s.sendJson.mockResolvedValue({ settings: settingsAnswer({ accessMode: "open", relayNodes: [saved] }) });
    await s.st.scheduleSave("relay", "access");
    expect(s.sendJson.mock.calls[0][2].relayNodes).toEqual([
      { id: "relay-a", name: "A", target: "a.example.com:9987", enabled: true, tokenAction: "keep" },
    ]);
    expect(s.st.serverForm.relayNodes[0]!.name).toBe("");
    expect(s.st.issueText("relay:relay-a:name")).toBe(t("issueRelayName"));
  });

  it("will not enable a relay without a token, and takes a short token for a mistake", async () => {
    const saved = { id: "relay-a", name: "A", target: "a.example.com:9987", enabled: false, hasToken: false };
    const s = await loaded({ relayNodes: [saved] });
    s.st.serverForm.relayNodes[0]!.enabled = true;
    await s.st.scheduleSave("relay");
    expect(s.sendJson).not.toHaveBeenCalled();
    expect(s.st.issueText("relay:relay-a:token")).toBe(t("issueRelayTokenRequired"));

    Object.assign(s.st.serverForm.relayNodes[0]!, { tokenAction: "replace", token: "short" });
    await s.st.scheduleSave("relay");
    expect(s.sendJson).not.toHaveBeenCalled();
    expect(s.st.issueText("relay:relay-a:token")).toBe(t("issueRelayTokenShort", { min: 16 }));
  });

  it("removes a node by leaving it out of the document", async () => {
    const saved = { id: "relay-a", name: "A", target: "a.example.com:9987", enabled: false, hasToken: false };
    const s = await loaded({ relayNodes: [saved] });
    s.sendJson.mockResolvedValue({ settings: settingsAnswer() });
    s.st.removeRelayNode(0);
    await s.st.scheduleSave("relay");
    expect(s.sendJson.mock.calls[0][2].relayNodes).toEqual([]);
  });

  it("saves the choice at once when WebRTC is switched on, and opens the port notice", async () => {
    const s = await loaded();
    s.sendJson.mockResolvedValue({ settings: settingsAnswer({ webRtcEnabled: true }) });
    s.st.serverForm.webRtcEnabled = true;
    s.st.handleWebRtcToggle();
    expect(s.st.webrtcPortNoticeOpen).toBe(true);
    await s.st.scheduleSave("advanced");
    expect(s.sendJson.mock.calls[0][2]).toMatchObject({ webRtcEnabled: true, webRtcUdpStart: 40000 });
    expect(s.st.statuses.advanced.state).toBe("saved");
  });

  it("runs saves one at a time, the second sends both changes", async () => {
    const s = await loaded();
    let release: (value: unknown) => void = () => {};
    s.sendJson.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    s.st.serverForm.siteName = "First";
    const first = s.st.scheduleSave("access");
    await vi.waitFor(() => expect(s.sendJson).toHaveBeenCalledTimes(1));

    s.st.serverForm.accessMode = "open";
    const second = s.st.scheduleSave("access");
    s.st.serverForm.identityMintQueueDepth = 5;
    void s.st.scheduleSave("advanced");
    await Promise.resolve();
    expect(s.sendJson).toHaveBeenCalledTimes(1);

    s.sendJson.mockResolvedValueOnce({ settings: settingsAnswer({ siteName: "First", accessMode: "open", identityMintQueueDepth: 5 }) });
    release({ settings: settingsAnswer({ siteName: "First" }) });
    await Promise.all([first, second]);
    expect(s.sendJson).toHaveBeenCalledTimes(2);
    expect(s.sendJson.mock.calls[1][2]).toMatchObject({ siteName: "First", accessMode: "open", identityMintQueueDepth: 5 });
    expect(s.st.statuses.access.state).toBe("saved");
    expect(s.st.statuses.advanced.state).toBe("saved");
  });

  it("keeps what was typed while a save was on its way", async () => {
    const s = await loaded();
    let release: (value: unknown) => void = () => {};
    s.sendJson.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    s.st.serverForm.siteName = "First";
    const saving = s.st.scheduleSave("access");
    await vi.waitFor(() => expect(s.sendJson).toHaveBeenCalledTimes(1));

    s.st.serverForm.siteName = "Typed on";
    release({ settings: settingsAnswer({ siteName: "First" }) });
    await saving;
    expect(s.st.serverForm.siteName).toBe("Typed on");
  });

  it("shows a refused save in the section it is about, keeps the value and saves nothing else", async () => {
    const s = await loaded();
    s.st.serverForm.webRtcUdpStart = 41000;
    s.st.serverForm.webRtcUdpEnd = 41100;
    s.sendJson.mockRejectedValue({ code: "INVALID_WEBRTC_PORT_RANGE" });
    await s.st.scheduleSave("advanced");
    expect(s.st.statuses.advanced.error).toBe(s.feedback.errorText("INVALID_WEBRTC_PORT_RANGE"));
    expect(s.st.statuses.advanced.state).toBe("idle");
    expect(s.st.statuses.access.error).toBe("");
    expect(s.feedback.errorMessage).toBe("");
    expect(s.st.serverForm.webRtcUdpStart).toBe(41000);
    expect(s.loadOverview).not.toHaveBeenCalled();
  });

  it("names the relay section for a refused relay node, whichever section asked", async () => {
    const s = await loaded();
    s.st.serverForm.accessMode = "open";
    s.sendJson.mockRejectedValue({ code: "INVALID_RELAY_TARGET" });
    await s.st.scheduleSave("access");
    expect(s.st.statuses.relay.error).toBe(s.feedback.errorText("INVALID_RELAY_TARGET"));
    expect(s.st.statuses.access.error).toBe("");
  });

  it("keeps a refusal until a save goes through", async () => {
    const s = await loaded();
    s.st.serverForm.siteName = "Night Owls";
    s.sendJson.mockRejectedValueOnce({ code: "INVALID_SITE_NAME" });
    await s.st.scheduleSave("access");
    expect(s.st.statuses.access.error).not.toBe("");

    s.sendJson.mockResolvedValue({ settings: settingsAnswer({ siteName: "Night Owls" }) });
    await s.st.scheduleSave("access");
    expect(s.st.statuses.access.error).toBe("");
    expect(s.st.statuses.access.state).toBe("saved");
  });

  it("forgets everything on reset", async () => {
    const s = await loaded();
    s.st.serverForm.siteName = "";
    await s.st.scheduleSave("access");
    s.st.reset();
    expect(s.st.issues).toEqual({});
    expect(s.st.serverForm.siteName).toBe("WebSpeak");
    expect(s.st.statuses.access.state).toBe("idle");
  });
});

describe("useAdminServerSettingsStore (view)", () => {
  it("exposes the WebRTC range as text", () => {
    const s = setup();
    expect(s.st.webrtcPortRangeText).toBe("40000–40099");
  });
});

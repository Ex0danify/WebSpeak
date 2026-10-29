import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { registerAdminStores } from "@/features/admin/shell/adminStores";
import { useAdminSessionStore } from "@/features/admin/core/adminSession";
import { useAdminFeedbackStore } from "@/features/admin/core/adminFeedback";
import { useAdminOverviewStore } from "@/features/admin/dashboard/adminOverview";
import { DEFAULT_WELCOME_TEXTS } from "@/features/admin/settings/adminServerForm";
import { useAdminServerSettingsStore } from "@/features/admin/settings/adminServerSettings";
import IdentityMintCard from "@/features/admin/gateway/IdentityMintCard.vue";
import RelayNodesCard from "@/features/admin/gateway/RelayNodesCard.vue";
import WebRtcCard from "@/features/admin/gateway/WebRtcCard.vue";
import RetentionCard from "@/features/admin/diagnostics/RetentionCard.vue";
import WebIdentityCard from "@/features/admin/web/WebIdentityCard.vue";
import { useI18n } from "@/shared/i18n/useI18n";

vi.mock("vue-router", () => ({ useRoute: () => ({ path: "/admin" }), useRouter: () => ({ replace: vi.fn() }) }));

const { t } = useI18n();

const settingsAnswer = {
  accessMode: "fixed",
  siteName: "WebSpeak",
  privacyNoticeUrl: "",
  welcomeTexts: {},
  welcomeDefaults: DEFAULT_WELCOME_TEXTS,
  webRtcEnabled: false,
  webRtcUdpStart: 40000,
  webRtcUdpEnd: 40099,
  identityMintMaxLevel: 8,
  identityMintConcurrency: 2,
  identityMintQueueDepth: 20,
  eventLogRetentionDays: 90,
  eventLogMaxRows: 5000,
  connectionRetentionDays: 30,
  connectionMaxRows: 10000,
  logRetentionDays: 14,
  relayNodes: [],
};

async function setup() {
  const pinia = createPinia();
  setActivePinia(pinia);
  registerAdminStores();
  const getJson = vi.fn().mockResolvedValue(settingsAnswer);
  Object.assign(useAdminSessionStore(), { getJson, sendJson: vi.fn(), screen: "admin" });
  Object.assign(useAdminFeedbackStore(), { notify: vi.fn() });
  Object.assign(useAdminOverviewStore(), { loadOverview: vi.fn(async () => {}) });
  const settings = useAdminServerSettingsStore();
  await settings.loadServerSettings();
  const scheduleSave = vi.fn();
  // The cards take the action when they are set up, so it is replaced before they mount.
  Object.assign(settings, { scheduleSave });
  return { settings, scheduleSave, pinia };
}

/** Every input of the card is named by a label that points at it, which is what a screen reader reads out. */
function expectLabelled(wrapper: VueWrapper, count: number) {
  const inputs = wrapper.findAll("input:not([type=checkbox])");
  expect(inputs).toHaveLength(count);
  for (const input of inputs) {
    const id = input.attributes("id");
    expect(id).toBeTruthy();
    expect(wrapper.find(`label[for="${id}"]`).exists()).toBe(true);
  }
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("RetentionCard", () => {
  it("labels its five limits and saves the group once a value changed", async () => {
    const { settings, scheduleSave, pinia } = await setup();
    const wrapper = mount(RetentionCard, { global: { plugins: [pinia] } });
    expectLabelled(wrapper, 5);
    const first = wrapper.find("input");
    await first.setValue("30");
    await first.trigger("change");
    expect(settings.serverForm.eventLogRetentionDays).toBe(30);
    expect(scheduleSave).toHaveBeenCalledWith("retention");
  });
});

describe("IdentityMintCard", () => {
  it("labels its three limits and saves the group once a value changed", async () => {
    const { settings, scheduleSave, pinia } = await setup();
    const wrapper = mount(IdentityMintCard, { global: { plugins: [pinia] } });
    expectLabelled(wrapper, 3);
    const inputs = wrapper.findAll("input");
    await inputs[2]!.setValue("50");
    await inputs[2]!.trigger("change");
    expect(settings.serverForm.identityMintQueueDepth).toBe(50);
    expect(scheduleSave).toHaveBeenCalledWith("mint");
  });
});

describe("WebRtcCard", () => {
  it("labels the port range and saves it when it is edited", async () => {
    const { settings, scheduleSave, pinia } = await setup();
    const wrapper = mount(WebRtcCard, { global: { plugins: [pinia] } });
    const ports = wrapper.findAll("input[type=number]");
    expect(ports).toHaveLength(2);
    for (const port of ports) expect(wrapper.find(`label[for="${port.attributes("id")}"]`).exists()).toBe(true);
    await ports[0]!.setValue("41000");
    await ports[0]!.trigger("change");
    expect(settings.serverForm.webRtcUdpStart).toBe(41000);
    expect(scheduleSave).toHaveBeenCalledWith("webrtc");
  });

  it("locks the port range while WebRTC is on and says so", async () => {
    const { settings, pinia } = await setup();
    settings.serverForm.webRtcEnabled = true;
    const wrapper = mount(WebRtcCard, { global: { plugins: [pinia] } });
    for (const port of wrapper.findAll("input[type=number]")) expect(port.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain(t("webrtcPortRangeLocked"));
  });
});

describe("WebIdentityCard", () => {
  it("labels the site name and the privacy notice and saves them", async () => {
    const { settings, scheduleSave, pinia } = await setup();
    const wrapper = mount(WebIdentityCard, { global: { plugins: [pinia] } });
    const [siteName, privacyUrl] = wrapper.findAll("input");
    for (const input of [siteName!, privacyUrl!]) expect(wrapper.find(`label[for="${input.attributes("id")}"]`).exists()).toBe(true);
    await siteName!.setValue("  Our Site ");
    await siteName!.trigger("change");
    expect(settings.serverForm.siteName).toBe("Our Site");
    await privacyUrl!.setValue("https://example.org/privacy");
    await privacyUrl!.trigger("change");
    expect(scheduleSave).toHaveBeenCalledWith("web");
  });

  it("edits the welcome text of the chosen language", async () => {
    const { settings, scheduleSave, pinia } = await setup();
    const wrapper = mount(WebIdentityCard, { global: { plugins: [pinia] } });
    const text = wrapper.find("textarea");
    expect(wrapper.find(`label[for="${text.attributes("id")}"]`).exists()).toBe(true);
    await text.setValue("Hello there");
    await text.trigger("change");
    expect(settings.selectedWelcomeText).toBe("Hello there");
    expect(scheduleSave).toHaveBeenCalledWith("web");
  });
});

describe("RelayNodesCard", () => {
  it("tells there is no relay node yet", async () => {
    const { pinia } = await setup();
    const wrapper = mount(RelayNodesCard, { global: { plugins: [pinia] } });
    expect(wrapper.text()).toContain(t("relayNodeEmpty"));
  });

  it("labels the fields of a node, locks its token unless it is replaced and removes it", async () => {
    const { settings, scheduleSave, pinia } = await setup();
    settings.addRelayNode();
    const wrapper = mount(RelayNodesCard, { global: { plugins: [pinia] } });
    expect(wrapper.text()).not.toContain(t("relayNodeEmpty"));
    expectLabelled(wrapper, 3);
    const [name, target, token] = wrapper.findAll("input:not([type=checkbox])");
    expect(token!.attributes("disabled")).toBeUndefined();
    settings.serverForm.relayNodes[0]!.tokenAction = "keep";
    await wrapper.vm.$nextTick();
    expect(token!.attributes("disabled")).toBeDefined();
    await name!.setValue("  Edge ");
    await name!.trigger("change");
    await target!.setValue("edge.example.org:9987");
    await target!.trigger("change");
    expect(settings.serverForm.relayNodes[0]).toMatchObject({ name: "Edge", target: "edge.example.org:9987" });
    expect(scheduleSave).toHaveBeenCalledWith("relay");

    const remove = wrapper.findAll("button").find((button) => button.text() === t("remove"));
    await remove!.trigger("click");
    expect(settings.serverForm.relayNodes).toHaveLength(0);
  });
});

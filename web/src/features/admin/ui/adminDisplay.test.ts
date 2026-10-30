import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { mount, RouterLinkStub } from "@vue/test-utils";
import { registerAdminStores } from "@/features/admin/shell/adminStores";
import { createAdminFormat } from "@/features/admin/core/adminFormat";
import type { AdminConnectionAudio, AdminConnectionRecord } from "@/features/admin/core/adminTypes";
import { useAdminOverviewStore } from "@/features/admin/dashboard/adminOverview";
import Metrics from "@/features/admin/dashboard/Metrics.vue";
import ConnectionRow from "@/features/admin/users/connections/ConnectionRow.vue";
import SaveStatus from "@/features/admin/ui/SaveStatus.vue";
import { useI18n } from "@/shared/i18n/useI18n";

const i18n = useI18n();
const { t } = i18n;

beforeEach(() => {
  document.body.innerHTML = "";
  setActivePinia(createPinia());
  registerAdminStores();
});

describe("SaveStatus", () => {
  const mountStatus = (state: "idle" | "saving" | "saved", quiet = false) =>
    mount(SaveStatus, { props: { status: { state, error: "" }, quiet }, global: { stubs: { transition: false } } });

  it("keeps an empty live region while nothing happens", () => {
    const wrapper = mountStatus("idle");
    expect(wrapper.find("[role=status]").exists()).toBe(true);
    expect(wrapper.text()).toBe("");
  });

  it("says that it saves, and that it saved with a check mark", () => {
    expect(mountStatus("saving").text()).toBe(t("saving"));
    const saved = mountStatus("saved");
    expect(saved.text()).toContain(t("savedStatus"));
    expect(saved.find("svg").exists()).toBe(true);
    expect(saved.find(".text-success").exists()).toBe(true);
  });

  it("only tells a screen reader when it is quiet", () => {
    const wrapper = mountStatus("saved", true);
    expect(wrapper.text()).toContain(t("savedStatus"));
    expect(wrapper.find(".sr-only").exists()).toBe(true);
    expect(wrapper.find("svg").exists()).toBe(false);
  });
});

describe("Metrics", () => {
  function mountMetrics(overview: Record<string, unknown>) {
    const pinia = createPinia();
    setActivePinia(pinia);
    registerAdminStores();
    Object.assign(useAdminOverviewStore().overview, overview);
    return mount(Metrics, { global: { plugins: [pinia], stubs: { RouterLink: RouterLinkStub } } });
  }

  it("shows a dash for a gateway without a version and the counts of the rest", () => {
    const wrapper = mountMetrics({});
    const cards = wrapper.findAll("article");
    expect(cards).toHaveLength(4);
    expect(cards[0]!.find("strong").text()).toBe("—");
    expect(cards[1]!.find("strong").text()).toBe("0");
    expect(cards[2]!.find("strong").text()).toBe("0 / 100");
  });

  it("counts the servers that answer and links the invites to their page", () => {
    const wrapper = mountMetrics({
      gateway: { version: "1.2.3", uptimeSeconds: 3600 },
      servers: [
        { id: "a", name: "A", target: "a:1", status: "reachable", lastTestAt: null, latencyMs: 4 },
        { id: "b", name: "B", target: "b:1", status: "unreachable", lastTestAt: null, latencyMs: null },
      ],
      sessions: { active: 3, peak: 8, limit: 20 },
      invites: { active: 5 },
    });
    const cards = wrapper.findAll("article");
    expect(cards[0]!.find("strong").text()).toBe("1.2.3");
    expect(cards[1]!.find("strong").text()).toBe("2");
    expect(cards[1]!.text()).toContain(t("serversReachable", { reachable: 1, total: 2 }));
    expect(cards[2]!.find("strong").text()).toBe("3 / 20");
    expect(cards[2]!.text()).toContain(t("peakSessions", { count: 8 }));
    expect(cards[3]!.find("strong").text()).toBe("5");
    expect(cards[3]!.findComponent(RouterLinkStub).props("to")).toBe("/admin/users/invites");
    expect(cards[0]!.findComponent(RouterLinkStub).exists()).toBe(false);
  });
});

const record = (patch: Partial<AdminConnectionRecord> = {}): AdminConnectionRecord => ({
  id: "c1",
  nickname: "alice",
  clientIp: "203.0.113.5",
  target: "ts.example.com:9987",
  relayName: null,
  relayTarget: null,
  startedAt: "2026-10-29T10:00:00.000Z",
  connectedAt: "2026-10-29T10:00:02.000Z",
  disconnectedAt: null,
  durationSeconds: 90,
  status: "active",
  reason: null,
  failureDetail: null,
  audio: null,
  userAgent: null,
  client: null,
  ...patch,
});

const audio = (patch: Partial<AdminConnectionAudio> = {}): AdminConnectionAudio => ({
  talkSeconds: 12,
  framesSent: 1200,
  framesReceived: 3400,
  droppedFrames: 0,
  sendErrors: 0,
  path: null,
  ...patch,
});

describe("ConnectionRow", () => {
  const mountRow = (patch: Partial<AdminConnectionRecord> = {}) => mount(ConnectionRow, { props: { record: record(patch) } });

  it("names the guest, the route and the state of a running connection", () => {
    const wrapper = mountRow();
    expect(wrapper.find("strong").text()).toBe("alice");
    expect(wrapper.text()).toContain("ts.example.com:9987");
    expect(wrapper.text()).toContain(t("connectedAt"));
    expect(wrapper.text()).toContain(t("duration"));
    expect(wrapper.text()).not.toContain(t("disconnectedAt"));
    expect(wrapper.text()).not.toContain(t("failureReason"));
  });

  it("shows when a connection ended and why", () => {
    const wrapper = mountRow({
      status: "disconnected",
      disconnectedAt: "2026-10-29T10:01:32.000Z",
      reason: "KICKED",
      failureDetail: "kicked by admin",
    });
    expect(wrapper.text()).toContain(t("disconnectedAt"));
    expect(wrapper.text()).toContain(t("failureReason"));
    expect(wrapper.text()).toContain("kicked by admin");
  });

  it("says attempted for a connection that never got through", () => {
    const wrapper = mountRow({ status: "failed", connectedAt: null, durationSeconds: null, reason: "TIMEOUT" });
    expect(wrapper.text()).toContain(t("connectionAttemptedAt"));
    expect(wrapper.text()).not.toContain(t("connectedAt"));
  });

  it("lists the client and the voice traffic when they were recorded", () => {
    const wrapper = mountRow({
      client: { browser: "Firefox", browserVersion: "130", os: "Linux", osVersion: null, platform: "desktop", engine: null },
      userAgent: "Mozilla/5.0",
      audio: audio({ droppedFrames: 4 }),
      relayName: "edge",
      relayTarget: "relay.example.com:9987",
    });
    expect(wrapper.text()).toContain("Firefox 130");
    expect(wrapper.text()).toContain("Mozilla/5.0");
    expect(wrapper.text()).toContain("edge");
    expect(wrapper.findAll("small").length).toBeGreaterThan(6);
  });
});

describe("createAdminFormat for connections", () => {
  const format = () => createAdminFormat(i18n.language, t);

  it("names the way a connection took, with and without a relay", () => {
    const { connectionRoute } = format();
    expect(connectionRoute(record())).toBe(t("connectionFromTo", { ip: "203.0.113.5", target: "ts.example.com:9987" }));
    expect(connectionRoute(record({ clientIp: "", target: "" }))).toBe(t("connectionFromTo", { ip: "—", target: "—" }));
    expect(connectionRoute(record({ relayName: "edge" }))).toContain(t("connectionViaRelay", { relay: "edge" }));
    expect(connectionRoute(record({ relayTarget: "r:1" }))).toContain(t("connectionViaRelay", { relay: "r:1" }));
    expect(connectionRoute(record({ relayName: "edge", relayTarget: "r:1" }))).toContain("edge · r:1");
  });

  it("describes what the client was, and falls back to the raw value", () => {
    const { connectionClientLines } = format();
    const client = (patch: Record<string, string | null>) => ({
      browser: null,
      browserVersion: null,
      os: null,
      osVersion: null,
      platform: null,
      engine: null,
      ...patch,
    });
    expect(connectionClientLines({ client: null, userAgent: null })).toEqual([]);
    expect(connectionClientLines({ client: client({}), userAgent: null })).toEqual([]);
    expect(connectionClientLines({ client: client({ platform: "console" }), userAgent: null })[0]).toContain("console");
    expect(connectionClientLines({ client: client({ os: "Linux", osVersion: "6.1", platform: "tv" }), userAgent: "UA" })).toHaveLength(2);
    for (const platform of ["desktop", "mobile", "tablet"]) {
      expect(connectionClientLines({ client: client({ platform }), userAgent: null })[0], platform).not.toContain(platform);
    }
  });

  it("lists drops, errors and the path of the audio", () => {
    const { connectionAudioLines } = format();
    const path = {
      transport: "webrtc" as const,
      uplinkFrames: 1000,
      uplinkMaxGapMs: 40,
      downlinkFrames: 2000,
      downlinkMaxGapMs: 60,
      queueUnderruns: 0,
      lateTicks: 0,
      decodeErrors: 0,
      ice: null,
    };
    expect(connectionAudioLines(null)).toEqual([]);
    expect(connectionAudioLines(audio())).toHaveLength(1);
    expect(connectionAudioLines(audio({ droppedFrames: 3, sendErrors: 2 }))).toHaveLength(3);
    expect(connectionAudioLines(audio({ path }))).toHaveLength(2);
    expect(connectionAudioLines(audio({ path: { ...path, transport: "websocket" } }))).toHaveLength(2);
    expect(connectionAudioLines(audio({ path: { ...path, lateTicks: 2 } }))).toHaveLength(3);
  });

  it("describes the ICE state, the candidate type and the timings when they are known", () => {
    const { connectionAudioLines } = format();
    const base = {
      transport: "webrtc" as const,
      uplinkFrames: 1,
      uplinkMaxGapMs: 1,
      downlinkFrames: 1,
      downlinkMaxGapMs: 1,
      queueUnderruns: 0,
      lateTicks: 0,
      decodeErrors: 0,
    };
    const lines = (ice: Record<string, unknown>) =>
      connectionAudioLines(audio({ path: { ...base, ice: { state: "connected", localType: null, remoteType: null, protocol: null, rttMs: null, connectMs: null, ...ice } } }));
    const bare = lines({});
    expect(bare).toHaveLength(3);
    const full = lines({ state: "weird", remoteType: "srflx", protocol: "udp", rttMs: 24, connectMs: 310 });
    expect(full[2]).toContain("weird");
    expect(full[2]).toContain("UDP");
    expect(full[2]).toContain("24");
    expect(full[2]).toContain("310");
    expect(lines({ remoteType: "mystery" })[2]).toContain("mystery");
    expect(lines({ remoteType: "host" })[2]).toContain("—");
  });
});

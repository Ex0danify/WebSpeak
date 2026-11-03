// The Connection tab of the profile dialog: sampling only while it shows, the badge and the figures.
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import ProfileDialog from "@/features/room/profile/ProfileDialog.vue";
import type { ChannelMember, PermissionEntry } from "@/features/session";
import { fakeConnection } from "@/testSupport/connectionFixture";

vi.mock("@/features/identity", async () => {
  const { ref } = await import("vue");
  return { downloadIdentity: vi.fn(), useIdentityManager: () => ({ identities: ref([]), refresh: vi.fn().mockResolvedValue(undefined) }) };
});

const member: ChannelMember = { id: 7, nickname: "roka", uid: "dWlkLWJhc2U2NA==", isSelf: true };

afterEach(() => {
  document.body.innerHTML = "";
});

async function open(connection = fakeConnection(), permissions: PermissionEntry[] = []) {
  const wrapper = mount(ProfileDialog, {
    props: {
      modelValue: true,
      member,
      identityMaterial: "",
      requestIdentity: () => Promise.resolve(""),
      changeNickname: () => Promise.resolve(),
      connection: connection as never,
      screenShareStats: { updatedAt: null, capture: null, peers: [] },
      permissions,
    },
    attachTo: document.body,
    global: { stubs: { transition: false } },
  });
  await nextTick();
  return { wrapper, connection };
}

async function selectTab(name: string): Promise<void> {
  const tab = Array.from(document.body.querySelectorAll('[role="tab"]')).find((el) => el.textContent?.trim() === name);
  tab?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
  await nextTick();
  await flushPromises();
}

const dialogText = () => document.body.querySelector('[role="dialog"]')?.textContent ?? "";
const sectionText = (title: string) =>
  Array.from(document.body.querySelectorAll("section")).find((section) => section.querySelector("h3")?.textContent === title)
    ?.textContent ?? "";
const live = () =>
  Array.from(document.body.querySelectorAll('[aria-live="polite"]'))
    .map((el) => el.textContent)
    .join(" ");

describe("ProfileDialog connection", () => {
  it("measures only while the Connection tab is showing", async () => {
    const { wrapper, connection } = await open();
    await flushPromises();
    expect(connection.measureLatency).not.toHaveBeenCalled();
    await selectTab("Connection");
    expect(connection.measureLatency).toHaveBeenCalledTimes(1);
    await selectTab("Identity");
    await wrapper.setProps({ modelValue: true });
    wrapper.unmount();
  });

  it("stops measuring when the dialog closes", async () => {
    vi.useFakeTimers();
    const { wrapper, connection } = await open();
    await selectTab("Connection");
    await wrapper.setProps({ modelValue: false });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(connection.measureLatency).toHaveBeenCalledTimes(1);
    wrapper.unmount();
    vi.useRealTimers();
  });

  it("rates the connection and lists latency and voice figures", async () => {
    const { wrapper } = await open();
    await selectTab("Connection");
    expect(live()).toContain("Excellent");
    const text = dialogText();
    expect(text).toContain("Browser to gateway");
    expect(text).toMatch(/30\s*ms/);
    expect(text).toContain("WebRTC");
    wrapper.unmount();
  });

  it("downgrades the badge on a shaky voice link", async () => {
    const { wrapper } = await open(fakeConnection({ voice: { jitterMs: 45 } }));
    await selectTab("Connection");
    expect(live()).toContain("Poor");
    wrapper.unmount();
  });

  it("says the WebSocket fallback only estimates, and shows dropouts", async () => {
    const { wrapper } = await open(
      fakeConnection({
        voice: {
          transport: "websocket",
          jitterMs: 12,
          lossPercent: null,
          concealedPercent: null,
          rttMs: null,
          uplinkKbps: null,
          codec: null,
          glitches: 3,
          audioFrames: 6000,
        },
      }),
    );
    await selectTab("Connection");
    // The screen share column has its own packet loss and codec rows, so only the voice section counts here.
    const text = sectionText("Voice");
    expect(text).toContain("Jitter (estimated)");
    expect(text).toContain("WebRTC is not available");
    expect(text).not.toContain("Packet loss");
    expect(text).not.toContain("Codec");
    expect(text).toContain("Dropouts");
    wrapper.unmount();
  });

  it("shows the screen share column with dashes and an idle label while nothing is shared", async () => {
    const { wrapper } = await open();
    await selectTab("Connection");
    const text = sectionText("Capture");
    expect(text).toContain("Resolution");
    expect(text).toContain("—");
    expect(live()).toContain("Not running");
    wrapper.unmount();
  });

  it("fills the screen share column and says sharing while a stream is sent", async () => {
    const { wrapper } = await open();
    await wrapper.setProps({
      screenShareStats: {
        updatedAt: 1,
        capture: { width: 1920, height: 1080, frameRate: 30 },
        peers: [{ peerId: "p1", direction: "outbound", connectionState: "connected", candidateType: "host", bitrateKbps: 2500 }],
      } as never,
    });
    await selectTab("Connection");
    expect(live()).toContain("Sharing");
    expect(sectionText("Capture")).toMatch(/1920 × 1080 · 30\s*FPS/i);
    expect(sectionText("Sending to viewer")).toContain("connected · host");
    wrapper.unmount();
  });

  it("shows dashes while nothing is measured", async () => {
    const { wrapper } = await open(fakeConnection({ voice: null }));
    await selectTab("Connection");
    expect(dialogText()).toContain("—");
    wrapper.unmount();
  });
});

describe("ProfileDialog permissions", () => {
  it("lists what the server granted on the Permissions tab", async () => {
    const { wrapper } = await open(fakeConnection(), [{ name: "b_client_channel_textmessage_send", value: 1 }]);
    await selectTab("Permissions");
    expect(dialogText()).toContain("b_client_channel_textmessage_send");
    expect(dialogText()).toContain("Granted");
    wrapper.unmount();
  });
});

import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import AudioDock from "@/features/room/dock/AudioDock.vue";
import type { ChannelMember } from "@/features/session";
import type { AccompanimentAvailability } from "@/features/room/dock/accompanimentAvailability";
import type { AudioLinkStatus } from "@/features/room/dock/audioLinkStatus";

const base = {
  member: { id: 1, nickname: "roka", uid: "u1", avatar: "", isSelf: true } as ChannelMember | null,
  speaking: false,
  connection: "connected" as AudioLinkStatus,
  microphoneMuted: false,
  outputMuted: false,
  accompanimentActive: false,
  accompaniment: "ready" as AccompanimentAvailability,
  screenShareActive: false,
  screenShareStarting: false,
  screenShareSupported: true,
};

let wrapper: VueWrapper | undefined;

function mountDock(props: Partial<typeof base> = {}) {
  wrapper = mount(AudioDock, { props: { ...base, ...props }, attachTo: document.body });
  return wrapper;
}

function button(label: string) {
  return document.body.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
}

function buttonByText(text: string) {
  return Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent?.trim() === text);
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.innerHTML = "";
});

describe("AudioDock identity", () => {
  it("shows who you are and that you are connected", () => {
    mountDock();
    expect(document.body.textContent).toContain("roka");
    expect(document.body.textContent).toContain("Connected");
  });

  it("asks to open the profile from the name and avatar", () => {
    const dock = mountDock();
    button("Your profile: roka, Connected")?.click();
    expect(dock.emitted("open-profile")).toHaveLength(1);
  });

  it("names the state of the voice link and colors it", async () => {
    const dock = mountDock({ connection: "connecting" });
    const status = () =>
      Array.from(document.body.querySelectorAll("span")).find((el) => /^(Connected|Connecting…|Disconnected)$/.test(el.textContent ?? ""));
    expect(status()?.textContent).toBe("Connecting…");
    expect(status()?.className).toContain("text-warning");
    await dock.setProps({ connection: "disconnected" });
    expect(status()?.textContent).toBe("Disconnected");
    expect(status()?.className).toContain("text-danger");
    await dock.setProps({ connection: "connected" });
    expect(status()?.className).toContain("text-success");
  });

  it("says nothing about the microphone under your name", () => {
    mountDock({ microphoneMuted: true });
    expect(document.body.textContent).not.toContain("Microphone off");
  });

  it("still renders the buttons before the member is known", () => {
    mountDock({ member: null });
    expect(button("Microphone on")).not.toBeNull();
  });
});

describe("AudioDock mute buttons", () => {
  it("only toggle mute, they never open a panel", async () => {
    const dock = mountDock();
    button("Microphone on")?.click();
    button("Mute all audio")?.click();
    await nextTick();
    expect(dock.emitted("toggle-microphone")).toHaveLength(1);
    expect(dock.emitted("toggle-output-mute")).toHaveLength(1);
    expect(document.body.querySelector("[role=dialog]")).toBeNull();
  });

  it("report their state through aria-pressed and the label", () => {
    mountDock({ microphoneMuted: true, outputMuted: true });
    expect(button("Microphone off")?.getAttribute("aria-pressed")).toBe("true");
    expect(button("Restore audio")?.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("AudioDock options popover", () => {
  it("toggles audio sharing and opens the audio settings", async () => {
    const dock = mountDock();
    button("Audio options")?.click();
    await nextTick();
    document.body.querySelector<HTMLButtonElement>("[role=switch]")?.click();
    expect(dock.emitted("toggle-accompaniment")).toHaveLength(1);

    buttonByText("Audio settings")?.click();
    await nextTick();
    expect(dock.emitted("open-settings")).toHaveLength(1);
    expect(button("Audio options")?.getAttribute("aria-expanded")).toBe("false");
  });

  it("leaves the row out where the browser cannot share audio", async () => {
    mountDock({ accompaniment: "hidden" });
    button("Audio options")?.click();
    await nextTick();
    expect(document.body.querySelector("[role=switch]")).toBeNull();
    expect(buttonByText("Audio settings")).toBeDefined();
  });

  it.each([
    ["gatewayOff", "Not enabled on this gateway"],
    ["fallback", "Not available right now"],
  ] as const)("disables the switch and says why when %s", async (accompaniment, hint) => {
    mountDock({ accompaniment });
    button("Audio options")?.click();
    await nextTick();
    const toggle = document.body.querySelector<HTMLButtonElement>("[role=switch]");
    expect(toggle?.disabled).toBe(true);
    expect(document.getElementById(toggle?.getAttribute("aria-describedby") ?? "")?.textContent).toBe(hint);
  });

  it("keeps the switch off with the normal hint while the link is set up", async () => {
    mountDock({ accompaniment: "waiting" });
    button("Audio options")?.click();
    await nextTick();
    expect(document.body.querySelector<HTMLButtonElement>("[role=switch]")?.disabled).toBe(true);
    expect(document.body.textContent).toContain("Play audio from a tab or screen");
  });

  it("marks the gear while audio is shared", () => {
    mountDock({ accompanimentActive: true });
    expect(button("Audio options, sharing audio")).not.toBeNull();
  });
});

describe("AudioDock screen share button", () => {
  it("is left out where the browser cannot capture the screen", () => {
    mountDock({ screenShareSupported: false });
    expect(button("Share screen")).toBeNull();
    expect(button("Audio options")).not.toBeNull();
  });

  it("opens the share dialog while idle", async () => {
    const dock = mountDock();
    button("Share screen")?.click();
    await nextTick();
    expect(dock.emitted("open-screen-share")).toHaveLength(1);
    expect(dock.emitted("stop-screen-share")).toBeUndefined();
  });

  it("ignores clicks while the stream starts", async () => {
    const dock = mountDock({ screenShareStarting: true });
    const starting = button("Starting live stream");
    expect(starting?.getAttribute("aria-busy")).toBe("true");
    expect(starting?.querySelector(".animate-spin")).toBeNull();
    expect(starting?.querySelector("svg")?.getAttribute("class")).toContain("motion-safe:animate-share-starting-icon");
    starting?.click();
    await nextTick();
    expect(dock.emitted("open-screen-share")).toBeUndefined();
    expect(dock.emitted("stop-screen-share")).toBeUndefined();
  });

  it("asks before it stops a running share", async () => {
    const dock = mountDock({ screenShareActive: true });
    button("Sharing your screen. Stop sharing")?.click();
    await nextTick();
    expect(dock.emitted("stop-screen-share")).toBeUndefined();
    expect(document.body.textContent).toContain("Stop sharing your screen?");

    buttonByText("Stop sharing")?.click();
    await nextTick();
    expect(dock.emitted("stop-screen-share")).toHaveLength(1);
  });

  it("keeps sharing when the confirmation is cancelled", async () => {
    const dock = mountDock({ screenShareActive: true });
    button("Sharing your screen. Stop sharing")?.click();
    await nextTick();
    buttonByText("Cancel")?.click();
    await nextTick();
    expect(dock.emitted("stop-screen-share")).toBeUndefined();
    expect(button("Sharing your screen. Stop sharing")?.getAttribute("aria-expanded")).toBe("false");
  });
});

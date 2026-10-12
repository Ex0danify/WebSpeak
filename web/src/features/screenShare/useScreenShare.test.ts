import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, reactive, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelMember } from "@/features/session";
import type { ScreenShareOutputSettings, ScreenShareStream, ScreenShareViewer } from "./screenShareTypes";
import type { ScreenShareResolutionPreset } from "./useScreenShare";

type Exposed = {
  screenVideoEl: HTMLVideoElement | null;
  setScreenVideoElement: (element: unknown) => void;
  screenSharePlayerEl: HTMLElement | null;
  setScreenSharePlayerElement: (element: unknown) => void;
  screenShareFullscreen: boolean;
  syncScreenShareFullscreen: () => void;
  toggleScreenShareFullscreen: () => Promise<void>;
  screenShareResolutionOptions: Array<{ value: ScreenShareResolutionPreset; width?: number; height?: number; label: string }>;
  screenShareResolutionPreset: ScreenShareResolutionPreset;
  screenShareFrameRateOptions: number[];
  screenShareFrameRate: number;
  screenShareSettingsOpen: boolean;
  startScreenShareWithSettings: () => Promise<void>;
  screenShareIndicatorBars: number[];
  screenShareErrorText: string;
  activeScreenShareStream: ScreenShareStream | null;
  screenSharePlayerViewers: ScreenShareViewer[];
  screenSharePlayerViewerCount: number;
  screenSharePlayerOwnerName: string;
  screenShareStreamForMember: (member: ChannelMember) => ScreenShareStream | null;
  toggleScreenShareForMember: (member: ChannelMember) => void;
  screenShareViewerStyle: (viewer: { nickname: string; avatar?: string }) => Record<string, string>;
};

function member(id: number, nickname: string): ChannelMember {
  return { id, nickname };
}

function stream(overrides: Partial<ScreenShareStream> = {}): ScreenShareStream {
  return {
    streamId: "s1",
    source: "browser",
    ownerPeerId: "peer-1",
    ownerNickname: "Lucas",
    name: "Screen",
    audio: true,
    createdAt: Date.now(),
    viewerCount: 0,
    viewers: [],
    ...overrides,
  };
}

async function mountUseScreenShare(overrides: Record<string, unknown> = {}) {
  const { useScreenShare } = await import("./useScreenShare");
  const screenShareStreams = reactive<ScreenShareStream[]>([]);
  const options = {
    screenShareStreams,
    screenShareViewing: ref(false),
    screenShareViewingStreamId: ref(""),
    screenShareRemoteStream: ref<MediaStream | null>(null),
    screenShareRemoteVolume: ref(1),
    screenShareError: ref(""),
    screenShareErrorCode: ref(""),
    startScreenShare: vi.fn(async () => undefined) as (audio: boolean, settings?: ScreenShareOutputSettings) => Promise<void>,
    joinScreenShare: vi.fn(),
    leaveScreenShare: vi.fn(),
    avatarStyle: vi.fn((name: string, isSelf = false) => ({ background: isSelf ? "self" : name })),
    nickname: ref("Lucas"),
    ...overrides,
  };
  const wrapper = mount(defineComponent({ setup: () => useScreenShare({ ...options, screenShare: options }), template: "<div/>" }));
  await flushPromises();
  return { wrapper, vm: wrapper.vm as unknown as Exposed, options, screenShareStreams };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("resolution and frame-rate presets", () => {
  it("defaults to 1080p and 15 FPS when nothing is stored", async () => {
    const { vm } = await mountUseScreenShare();
    expect(vm.screenShareResolutionPreset).toBe("1080p");
    expect(vm.screenShareFrameRate).toBe(15);
  });

  it("restores a valid stored preset and frame rate", async () => {
    localStorage.setItem("webspeak:screen-share-resolution", "720p");
    localStorage.setItem("webspeak:screen-share-framerate", "30");
    const { vm } = await mountUseScreenShare();
    expect(vm.screenShareResolutionPreset).toBe("720p");
    expect(vm.screenShareFrameRate).toBe(30);
  });

  it("falls back to defaults for an invalid stored value", async () => {
    localStorage.setItem("webspeak:screen-share-resolution", "4k");
    localStorage.setItem("webspeak:screen-share-framerate", "999");
    const { vm } = await mountUseScreenShare();
    expect(vm.screenShareResolutionPreset).toBe("1080p");
    expect(vm.screenShareFrameRate).toBe(15);
  });
});

describe("setScreenVideoElement", () => {
  it("accepts a video element", async () => {
    const { vm } = await mountUseScreenShare();
    const video = document.createElement("video");
    vm.setScreenVideoElement(video);
    expect(vm.screenVideoEl).toBe(video);
  });

  it("ignores a non-video element", async () => {
    const { vm } = await mountUseScreenShare();
    vm.setScreenVideoElement(document.createElement("div"));
    expect(vm.screenVideoEl).toBeNull();
  });
});

describe("setScreenSharePlayerElement", () => {
  it("accepts any HTML element", async () => {
    const { vm } = await mountUseScreenShare();
    const section = document.createElement("section");
    vm.setScreenSharePlayerElement(section);
    expect(vm.screenSharePlayerEl).toBe(section);
  });

  it("ignores a non-element value", async () => {
    const { vm } = await mountUseScreenShare();
    vm.setScreenSharePlayerElement({});
    expect(vm.screenSharePlayerEl).toBeNull();
  });
});

describe("startScreenShareWithSettings", () => {
  it("persists the chosen preset and frame rate, closes the dialog, and starts sharing", async () => {
    const { vm, options } = await mountUseScreenShare();
    vm.screenShareResolutionPreset = "720p";
    vm.screenShareFrameRate = 30;
    vm.screenShareSettingsOpen = true;
    await vm.startScreenShareWithSettings();
    expect(localStorage.getItem("webspeak:screen-share-resolution")).toBe("720p");
    expect(localStorage.getItem("webspeak:screen-share-framerate")).toBe("30");
    expect(vm.screenShareSettingsOpen).toBe(false);
    expect(options.startScreenShare).toHaveBeenCalledWith(true, { maxWidth: 1280, maxHeight: 720, maxFrameRate: 30 });
  });

  it("omits width/height for the source preset", async () => {
    const { vm, options } = await mountUseScreenShare();
    vm.screenShareResolutionPreset = "source";
    await vm.startScreenShareWithSettings();
    expect(options.startScreenShare).toHaveBeenCalledWith(true, { maxFrameRate: 15 });
  });
});

describe("screenShareErrorText", () => {
  it("maps the native-bridge error code to a localized message", async () => {
    const { vm, options } = await mountUseScreenShare({ screenShareErrorCode: ref("SCREEN_SHARE_NATIVE_BRIDGE_REQUIRED") });
    expect(vm.screenShareErrorText).not.toBe("");
    expect(vm.screenShareErrorText).not.toBe(options.screenShareError.value);
  });

  it("passes through any other error message unchanged", async () => {
    const { vm } = await mountUseScreenShare({ screenShareError: ref("boom"), screenShareErrorCode: ref("") });
    expect(vm.screenShareErrorText).toBe("boom");
  });
});

describe("active stream derivations", () => {
  it("finds the viewed stream and derives viewers/count/owner", async () => {
    const viewers: ScreenShareViewer[] = [
      { peerId: "a", nickname: "Ana" },
      { peerId: "b", nickname: "Bo" },
    ];
    const { vm, screenShareStreams } = await mountUseScreenShare({ screenShareViewingStreamId: ref("s1") });
    screenShareStreams.push(stream({ streamId: "s1", ownerNickname: "Lucas", viewerCount: 2, viewers }));
    await flushPromises();
    expect(vm.activeScreenShareStream?.streamId).toBe("s1");
    expect(vm.screenSharePlayerViewers).toEqual(viewers);
    expect(vm.screenSharePlayerViewerCount).toBe(2);
    expect(vm.screenSharePlayerOwnerName).toBe("Lucas");
  });

  it("falls back to a generic owner label and no active stream when nothing matches", async () => {
    const { vm } = await mountUseScreenShare();
    expect(vm.activeScreenShareStream).toBeNull();
    expect(vm.screenSharePlayerViewers).toEqual([]);
    expect(vm.screenSharePlayerViewerCount).toBe(0);
    expect(vm.screenSharePlayerOwnerName).not.toBe("");
  });

  it("keeps only the last five viewers", async () => {
    const viewers: ScreenShareViewer[] = Array.from({ length: 7 }, (_, index) => ({ peerId: `p${index}`, nickname: `N${index}` }));
    const { vm, screenShareStreams } = await mountUseScreenShare({ screenShareViewingStreamId: ref("s1") });
    screenShareStreams.push(stream({ streamId: "s1", viewers, viewerCount: 7 }));
    await flushPromises();
    expect(vm.screenSharePlayerViewers.map((viewer) => viewer.peerId)).toEqual(["p2", "p3", "p4", "p5", "p6"]);
  });
});

describe("screenShareStreamForMember / toggleScreenShareForMember", () => {
  it("matches by ownerClientId first", async () => {
    const { vm, screenShareStreams } = await mountUseScreenShare();
    screenShareStreams.push(stream({ streamId: "s1", ownerClientId: 5, ownerNickname: "Someone Else" }));
    await flushPromises();
    expect(vm.screenShareStreamForMember(member(5, "Lucas"))?.streamId).toBe("s1");
  });

  it("matches a teamspeak-source stream by ts-<id> peer id", async () => {
    const { vm, screenShareStreams } = await mountUseScreenShare();
    screenShareStreams.push(stream({ streamId: "s1", source: "teamspeak", ownerPeerId: "ts-9", ownerNickname: "Other" }));
    await flushPromises();
    expect(vm.screenShareStreamForMember(member(9, "Lucas"))?.streamId).toBe("s1");
  });

  it("falls back to matching by nickname", async () => {
    const { vm, screenShareStreams } = await mountUseScreenShare();
    screenShareStreams.push(stream({ streamId: "s1", ownerNickname: "Ana" }));
    await flushPromises();
    expect(vm.screenShareStreamForMember(member(1, "Ana"))?.streamId).toBe("s1");
  });

  it("returns null when no stream matches", async () => {
    const { vm } = await mountUseScreenShare();
    expect(vm.screenShareStreamForMember(member(1, "Ana"))).toBeNull();
  });

  it("joins when not currently viewing the member's stream", async () => {
    const { vm, options, screenShareStreams } = await mountUseScreenShare();
    screenShareStreams.push(stream({ streamId: "s1", ownerNickname: "Ana" }));
    await flushPromises();
    vm.toggleScreenShareForMember(member(1, "Ana"));
    expect(options.joinScreenShare).toHaveBeenCalledWith("s1");
    expect(options.leaveScreenShare).not.toHaveBeenCalled();
  });

  it("leaves when already viewing the member's stream", async () => {
    const { vm, options, screenShareStreams } = await mountUseScreenShare({ screenShareViewingStreamId: ref("s1") });
    screenShareStreams.push(stream({ streamId: "s1", ownerNickname: "Ana" }));
    await flushPromises();
    vm.toggleScreenShareForMember(member(1, "Ana"));
    expect(options.leaveScreenShare).toHaveBeenCalled();
    expect(options.joinScreenShare).not.toHaveBeenCalled();
  });

  it("does nothing when the member has no stream", async () => {
    const { vm, options } = await mountUseScreenShare();
    vm.toggleScreenShareForMember(member(1, "Ana"));
    expect(options.joinScreenShare).not.toHaveBeenCalled();
    expect(options.leaveScreenShare).not.toHaveBeenCalled();
  });
});

describe("screenShareViewerStyle", () => {
  it("marks the viewer as self only when the nickname matches the local nickname", async () => {
    const { vm, options } = await mountUseScreenShare({ nickname: ref("Lucas") });
    vm.screenShareViewerStyle({ nickname: "Lucas" });
    expect(options.avatarStyle).toHaveBeenCalledWith("Lucas", true, "");
    vm.screenShareViewerStyle({ nickname: "Ana", avatar: "pic.png" });
    expect(options.avatarStyle).toHaveBeenCalledWith("Ana", false, "pic.png");
  });
});

describe("remote stream binding", () => {
  it("attaches the remote stream, applies volume, and plays when the video element is present", async () => {
    const { vm, options } = await mountUseScreenShare();
    const video = document.createElement("video");
    video.play = vi.fn(async () => undefined);
    vm.setScreenVideoElement(video);
    const remoteStream = new MediaStream();
    options.screenShareRemoteStream.value = remoteStream;
    options.screenShareRemoteVolume.value = 0.5;
    await flushPromises();
    expect(video.srcObject).toBe(remoteStream);
    expect(video.volume).toBe(0.5);
    expect(video.play).toHaveBeenCalled();
  });

  it("clamps volume into 0..1", async () => {
    const { vm, options } = await mountUseScreenShare();
    const video = document.createElement("video");
    video.play = vi.fn(async () => undefined);
    vm.setScreenVideoElement(video);
    options.screenShareRemoteStream.value = new MediaStream();
    options.screenShareRemoteVolume.value = 5;
    await flushPromises();
    expect(video.volume).toBe(1);
  });
});

describe("fullscreen", () => {
  function fakePlayer() {
    const player = document.createElement("div");
    player.requestFullscreen = vi.fn(async () => {
      Object.defineProperty(document, "fullscreenElement", { value: player, configurable: true });
    });
    return player;
  }

  beforeEach(() => {
    Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true });
    document.exitFullscreen = vi.fn(async () => {
      Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true });
    });
  });

  it("requests fullscreen on the player element and toggles the flag via the fullscreenchange listener", async () => {
    const { vm } = await mountUseScreenShare();
    const player = fakePlayer();
    vm.screenSharePlayerEl = player;
    await vm.toggleScreenShareFullscreen();
    expect(player.requestFullscreen).toHaveBeenCalled();
    document.dispatchEvent(new Event("fullscreenchange"));
    expect(vm.screenShareFullscreen).toBe(true);
  });

  it("exits fullscreen when already the fullscreen element", async () => {
    const { vm } = await mountUseScreenShare();
    const player = fakePlayer();
    vm.screenSharePlayerEl = player;
    await vm.toggleScreenShareFullscreen();
    await vm.toggleScreenShareFullscreen();
    expect(document.exitFullscreen).toHaveBeenCalled();
  });

  it("does nothing when there is no player element", async () => {
    const { vm } = await mountUseScreenShare();
    await vm.toggleScreenShareFullscreen();
    expect(document.exitFullscreen).not.toHaveBeenCalled();
  });

  it("exits fullscreen when viewing stops while the player is the fullscreen element", async () => {
    const { vm, options } = await mountUseScreenShare();
    const player = fakePlayer();
    vm.screenSharePlayerEl = player;
    options.screenShareViewing.value = true;
    await vm.toggleScreenShareFullscreen();
    options.screenShareViewing.value = false;
    await flushPromises();
    expect(document.exitFullscreen).toHaveBeenCalled();
  });

  it("stops listening for fullscreenchange on unmount", async () => {
    const { wrapper, vm } = await mountUseScreenShare();
    const player = fakePlayer();
    vm.screenSharePlayerEl = player;
    wrapper.unmount();
    Object.defineProperty(document, "fullscreenElement", { value: player, configurable: true });
    document.dispatchEvent(new Event("fullscreenchange"));
    expect(vm.screenShareFullscreen).toBe(false);
  });
});

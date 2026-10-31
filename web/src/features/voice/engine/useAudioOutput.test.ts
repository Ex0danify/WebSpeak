// useAudioOutput on its own: stores and browser stubs, no composable around it.
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { useVoiceAudioStore } from "@/features/voice/stores/voiceAudioStore";
import { useSessionStore } from "@/features/session";
import { FakeAudioContext, installBrowserStubs, type BrowserStubs } from "@/testSupport/browserStubs";
import { useAudioOutput } from "@/features/voice/engine/useAudioOutput";

let stubs: BrowserStubs;
let remoteGains: Map<number, GainNode>;
let saveAudioPreferences: Mock<() => Promise<void>>;

function setup() {
  const audio = useVoiceAudioStore();
  const session = useSessionStore();
  saveAudioPreferences = vi.fn<() => Promise<void>>(async () => undefined);
  const output = useAudioOutput({ saveAudioPreferences, remoteGains: () => remoteGains });
  return { audio, session, output };
}

/** happy-dom implements `HTMLMediaElement.setSinkId`; take it away to model a browser without sink selection. */
function withoutMediaSink(): void {
  const prototype = HTMLMediaElement.prototype as unknown as Record<string, unknown>;
  const original = Object.getOwnPropertyDescriptor(prototype, "setSinkId");
  delete prototype.setSinkId;
  restoreMediaSink = () => {
    if (original) Object.defineProperty(prototype, "setSinkId", original);
  };
}

let restoreMediaSink: () => void = () => undefined;

function fakeAudioElement() {
  return Object.assign(document.createElement("audio"), {
    play: vi.fn(async () => undefined),
    pause: vi.fn(),
    setSinkId: vi.fn(async () => undefined),
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  stubs = installBrowserStubs();
  remoteGains = new Map();
  window.localStorage.clear();
});
afterEach(() => {
  restoreMediaSink();
  restoreMediaSink = () => undefined;
  stubs.restore();
  vi.restoreAllMocks();
});

describe("output volume", () => {
  it("is the stored volume, or zero while muted", () => {
    const { audio, output } = setup();
    audio.outputVolume = 0.6;
    expect(output.effectiveOutputVolume()).toBe(0.6);
    audio.outputMuted = true;
    expect(output.effectiveOutputVolume()).toBe(0);
  });

  it("applies per-client volume times output volume to every remote gain and to the WebRTC element", () => {
    const { audio, output } = setup();
    const a = { gain: { value: 0 } } as unknown as GainNode;
    const b = { gain: { value: 0 } } as unknown as GainNode;
    remoteGains.set(4, a);
    remoteGains.set(5, b);
    audio.volumes[4] = 2;
    audio.outputVolume = 0.5;
    const element = fakeAudioElement();
    output.attachWebRtcPlayback(element, new MediaStream());
    output.applyOutputVolume();
    expect(a.gain.value).toBe(1);
    expect(b.gain.value).toBe(0.5);
    expect(element.volume).toBe(0.5);
    audio.outputMuted = true;
    output.applyOutputVolume();
    expect(a.gain.value).toBe(0);
    expect(element.volume).toBe(0);
  });
});

describe("audio context", () => {
  it("is created once at 48 kHz and mirrors its state into the audio store", () => {
    const { audio, output } = setup();
    expect(output.existingAudioCtx()).toBeNull();
    const ctx = output.getAudioCtx();
    expect(output.getAudioCtx()).toBe(ctx);
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(FakeAudioContext.instances[0].sampleRate).toBe(48000);
    expect(audio.audioContextState).toBe("running");
    FakeAudioContext.instances[0].setState("suspended");
    expect(audio.audioContextState).toBe("suspended");
    expect(output.existingAudioCtx()).toBe(ctx);
  });

  it("releaseAudioCtx closes it and the next getAudioCtx makes a new one", () => {
    const { output } = setup();
    output.getAudioCtx();
    output.releaseAudioCtx();
    expect(FakeAudioContext.instances[0].state).toBe("closed");
    expect(output.existingAudioCtx()).toBeNull();
    output.getAudioCtx();
    expect(FakeAudioContext.instances).toHaveLength(2);
  });

  it("reports no sink support when neither the context nor media elements have setSinkId", () => {
    withoutMediaSink();
    const { audio, output } = setup();
    output.getAudioCtx();
    expect(audio.outputDeviceSupported).toBe(false);
  });

  it("switches the context sink to the stored device when setSinkId exists", () => {
    const { audio, output } = setup();
    const setSinkId = vi.fn(async () => undefined);
    (FakeAudioContext.prototype as unknown as Record<string, unknown>).setSinkId = setSinkId;
    try {
      audio.selectedOutputDeviceId = "spk-1";
      output.getAudioCtx();
      expect(audio.outputDeviceSupported).toBe(true);
      expect(setSinkId).toHaveBeenCalledWith("spk-1");
    } finally {
      delete (FakeAudioContext.prototype as unknown as Record<string, unknown>).setSinkId;
    }
  });
});

describe("audio notices", () => {
  it("sets a sanitized code, and clears only a matching code when one is given", () => {
    const { session, output } = setup();
    output.setAudioNotice("PLAYBACK_BLOCKED");
    expect(session.roomNotices[0]?.code ?? "").toBe("PLAYBACK_BLOCKED");
    expect(session.roomNotices[0]?.text ?? "").toEqual({ key: "audioNoticePlaybackBlocked" });
    output.clearAudioNotice("OTHER");
    expect(session.roomNotices[0]?.text ?? "").toEqual({ key: "audioNoticePlaybackBlocked" });
    output.clearAudioNotice("PLAYBACK_BLOCKED");
    expect(session.roomNotices[0]?.text ?? "").toBe("");
    expect(session.roomNotices[0]?.code ?? "").toBe("");
  });

  it("falls back to AUDIO_NOTICE for an empty code and clears everything without a code", () => {
    const { session, output } = setup();
    output.setAudioNotice("");
    expect(session.roomNotices[0]?.code ?? "").toBe("AUDIO_NOTICE");
    output.clearAudioNotice();
    expect(session.roomNotices[0]?.text ?? "").toBe("");
  });

  it("syncAudioContextNotice reports a suspended context and clears the notice when it runs", () => {
    const { session, output } = setup();
    output.syncAudioContextNotice();
    expect(session.roomNotices[0]?.text ?? "").toBe("");
    output.getAudioCtx();
    FakeAudioContext.instances[0].setState("suspended");
    output.syncAudioContextNotice();
    expect(session.roomNotices[0]?.code ?? "").toBe("AUDIO_CONTEXT_SUSPENDED");
    FakeAudioContext.instances[0].setState("running");
    output.syncAudioContextNotice();
    expect(session.roomNotices[0]?.text ?? "").toBe("");
  });

  it("the gateway's audioError becomes the encoder notice, or the generic link notice, with the detail as a param", () => {
    const { session, output } = setup();
    output.handlers.audioError?.({ type: "audioError", code: "AUDIO_ENCODER_UNAVAILABLE" } as never);
    expect(session.roomNotices[0]?.text ?? "").toEqual({ key: "audioNoticeEncoder", params: { code: "AUDIO_ENCODER_UNAVAILABLE" } });
    output.handlers.audioError?.({ type: "audioError", code: "AUDIO_X", detail: "boom" } as never);
    expect(session.roomNotices[0]?.text ?? "").toEqual({ key: "audioNoticeLinkDetail", params: { code: "AUDIO_X", detail: "boom" } });
  });
});

describe("setOutputDevice", () => {
  it("rejects a device that is not in the list without touching the selection", async () => {
    const { audio, output } = setup();
    await expect(output.setOutputDevice("ghost")).rejects.toMatchObject({
      code: "SPEAKER_UNAVAILABLE",
      text: { key: "speakerUnavailable" },
    });
    expect(audio.selectedOutputDeviceId).toBe("");
  });

  it("stores the choice and saves the preferences on success", async () => {
    const { audio, output } = setup();
    audio.outputDevices.push({ deviceId: "spk-1", label: "Speakers", groupId: "g" });
    await output.setOutputDevice("spk-1");
    expect(audio.selectedOutputDeviceId).toBe("spk-1");
    expect(window.localStorage.getItem("webspeak:output-device")).toBe("spk-1");
    expect(saveAudioPreferences).toHaveBeenCalledTimes(1);
  });

  it("puts the previous device back when the sink cannot be set", async () => {
    withoutMediaSink();
    const { audio, output } = setup();
    audio.outputDevices.push({ deviceId: "spk-1", label: "Speakers", groupId: "g" });
    await expect(output.setOutputDevice("spk-1")).rejects.toMatchObject({
      code: "SPEAKER_SELECTION_UNSUPPORTED",
      text: { key: "speakerSelectionUnsupported" },
    });
    expect(audio.selectedOutputDeviceId).toBe("");
    expect(saveAudioPreferences).not.toHaveBeenCalled();
  });
});

describe("WebRTC playback element", () => {
  it("plays, unmutes and clears the blocked notice", async () => {
    const { session, output } = setup();
    const element = fakeAudioElement();
    output.setAudioNotice("PLAYBACK_BLOCKED");
    output.attachWebRtcPlayback(element, new MediaStream());
    await output.syncWebRtcPlayback();
    expect(element.muted).toBe(false);
    expect(element.play).toHaveBeenCalled();
    expect(session.roomNotices[0]?.text ?? "").toBe("");
  });

  it("does nothing without an element and a stream", async () => {
    const { session, output } = setup();
    await output.syncWebRtcPlayback();
    expect(session.roomNotices[0]?.text ?? "").toBe("");
  });

  it("tells the user when autoplay is blocked and retries on the next interaction", async () => {
    const { session, output } = setup();
    const element = fakeAudioElement();
    element.play.mockRejectedValueOnce(new Error("NotAllowedError"));
    output.attachWebRtcPlayback(element, new MediaStream());
    await output.syncWebRtcPlayback();
    expect(session.roomNotices[0]?.code ?? "").toBe("PLAYBACK_BLOCKED");
    window.dispatchEvent(new Event("pointerdown"));
    await vi.waitFor(() => expect(element.play).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(session.roomNotices[0]?.text ?? "").toBe(""));
    window.dispatchEvent(new Event("pointerdown"));
    await Promise.resolve();
    expect(element.play).toHaveBeenCalledTimes(2);
  });

  it("resumes a suspended context before playing", async () => {
    const { output } = setup();
    output.getAudioCtx();
    FakeAudioContext.instances[0].setState("suspended");
    output.attachWebRtcPlayback(fakeAudioElement(), new MediaStream());
    await output.syncWebRtcPlayback();
    expect(FakeAudioContext.instances[0].state).toBe("running");
  });

  it("stopWebRtcPlayback pauses, detaches and removes the element and stops retrying", async () => {
    const { output } = setup();
    const element = fakeAudioElement();
    element.play.mockRejectedValue(new Error("NotAllowedError"));
    document.body.append(element);
    output.attachWebRtcPlayback(element, new MediaStream());
    await output.syncWebRtcPlayback();
    output.stopWebRtcPlayback();
    expect(element.pause).toHaveBeenCalled();
    expect(element.srcObject).toBeNull();
    expect(document.body.contains(element)).toBe(false);
    element.play.mockClear();
    window.dispatchEvent(new Event("pointerdown"));
    await Promise.resolve();
    expect(element.play).not.toHaveBeenCalled();
  });
});

describe("playNotification", () => {
  it("plays a two-tone beep scaled by notification and output volume", () => {
    const { audio, output } = setup();
    audio.notificationVolume = 0.5;
    audio.outputVolume = 0.5;
    const ctx = output.getAudioCtx() as unknown as FakeAudioContext & Record<string, unknown>;
    const oscillator = { frequency: { setValueAtTime: vi.fn() }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    const param = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
    ctx.createOscillator = (() => oscillator) as unknown as FakeAudioContext["createOscillator"];
    (ctx as Record<string, unknown>).createGain = () => ({ gain: param, connect: vi.fn() });
    output.playNotification("poke");
    expect(oscillator.frequency.setValueAtTime.mock.calls.map((call) => call[0])).toEqual([740, 980]);
    expect(oscillator.start).toHaveBeenCalled();
    expect(oscillator.stop).toHaveBeenCalled();
  });

  it("is silent when muted, at zero notification volume, or while the context is suspended", () => {
    const { audio, output } = setup();
    const ctx = output.getAudioCtx() as unknown as FakeAudioContext & Record<string, unknown>;
    const createOscillator = vi.fn();
    ctx.createOscillator = createOscillator;
    audio.outputMuted = true;
    output.playNotification("poke");
    audio.outputMuted = false;
    audio.notificationVolume = 0;
    output.playNotification("poke");
    audio.notificationVolume = 0.5;
    ctx.setState("suspended");
    output.playNotification("poke");
    expect(createOscillator).not.toHaveBeenCalled();
  });

  it("never throws when the audio graph is unavailable", () => {
    const { audio, output } = setup();
    audio.notificationVolume = 0.5;
    output.getAudioCtx();
    expect(() => output.playNotification("connected")).not.toThrow();
  });
});

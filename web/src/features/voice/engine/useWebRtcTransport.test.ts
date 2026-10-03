// useWebRtcTransport on its own (Step V4.4): stores, browser stubs and stub deps, no composable around it.
// The wire messages (webrtcOffer, webrtcAnswer, webrtcError) are also pinned by messages.connection.test.ts.
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVoiceAudioStore } from "../stores/voiceAudioStore";
import { useSessionStore } from "@/features/session";
import {
  FakeAnalyserNode, FakeAudioContext, FakeMediaStream, FakeMediaStreamTrack, FakeRTCPeerConnection, installBrowserStubs,
  type BrowserStubs,
} from "@/testSupport/browserStubs";
import type { SinkAudioContext } from "../voiceTypes";
import { useWebRtcTransport, type WebRtcTransportDeps } from "./useWebRtcTransport";

let stubs: BrowserStubs;
let ctx: FakeAudioContext;
let micStream: FakeMediaStream | null;
let processedStream: FakeMediaStream | null;
let order: string[];

function socketStub(readyState = 1) {
  return { readyState, send: vi.fn() } as unknown as WebSocket & { send: ReturnType<typeof vi.fn>; readyState: number };
}

/** Record which stream every `createMediaStreamSource` call was given. */
function recordSources(): unknown[] {
  const sources: unknown[] = [];
  const target = ctx as unknown as { createMediaStreamSource: (stream?: unknown) => unknown };
  const create = target.createMediaStreamSource.bind(ctx);
  target.createMediaStreamSource = (stream?: unknown) => { sources.push(stream); return create(stream); };
  return sources;
}

/** A display capture track: `ended` listeners are kept so a test can end the share as the browser does. */
class FakeDisplayTrack extends FakeMediaStreamTrack {
  contentHint = "";
  applyConstraints = vi.fn(async (_constraints?: unknown) => undefined);
  private readonly endedListeners: (() => void)[] = [];
  override addEventListener(type?: string, listener?: () => void): void { if (type === "ended" && listener) this.endedListeners.push(listener); }
  end(): void { for (const listener of this.endedListeners.splice(0)) listener(); }
}

/** Puts a display-audio share on the peer's audio sender, as the accompaniment button does. */
async function shareAccompaniment(peer: FakeRTCPeerConnection, transport: ReturnType<typeof useWebRtcTransport>) {
  const audio = new FakeDisplayTrack("audio");
  const video = new FakeMediaStreamTrack("video");
  const replaceTrack = vi.fn(async (_track?: unknown) => undefined);
  vi.spyOn(peer, "getSenders").mockReturnValue([{ track: { kind: "audio" }, replaceTrack }] as unknown as RTCRtpSender[]);
  (navigator.mediaDevices as unknown as { getDisplayMedia: () => Promise<FakeMediaStream> }).getDisplayMedia = async () => new FakeMediaStream([audio, video]);
  await transport.startAccompaniment();
  return { audio, video, replaceTrack };
}

/** happy-dom only takes its own MediaStream as `srcObject`; the fakes are not one. */
function looseSrcObject(): void {
  Object.defineProperty(HTMLMediaElement.prototype, "srcObject", { value: null, writable: true, configurable: true });
}

function sentTypes(socket: WebSocket): string[] {
  return (socket.send as ReturnType<typeof vi.fn>).mock.calls.map(([frame]) => (JSON.parse(String(frame)) as { type: string }).type);
}

function setup(overrides: Partial<WebRtcTransportDeps> = {}) {
  const audio = useVoiceAudioStore();
  const session = useSessionStore();
  const base = {
    getMicStream: vi.fn(() => micStream as unknown as MediaStream | null),
    getProcessedMicStream: vi.fn(() => (processedStream ?? micStream) as unknown as MediaStream | null),
    ensureMicrophone: vi.fn(async () => undefined),
    startMicrophone: vi.fn(async () => undefined),
    stopCaptureGraph: vi.fn(() => { order.push("captureGraph"); }),
    setMicrophoneError: vi.fn(() => "message"),
    getAudioCtx: vi.fn(() => ctx as unknown as SinkAudioContext),
    effectiveOutputVolume: vi.fn(() => 0.5),
    stopWebRtcPlayback: vi.fn(() => { order.push("playback"); }),
    attachWebRtcPlayback: vi.fn(),
    syncWebRtcPlayback: vi.fn(async () => undefined),
    setAudioNotice: vi.fn(),
    markSpeaking: vi.fn(),
    clearSpeaking: vi.fn(),
    sendCmd: vi.fn(),
    connectionSequence: vi.fn(() => 3),
    hasLastConnection: vi.fn(() => true),
    webrtcActive: ref(false),
    micLevel: ref(0),
  } satisfies WebRtcTransportDeps;
  const deps = { ...base, ...overrides } as typeof base;
  return { audio, session, deps, transport: useWebRtcTransport(deps) };
}

/** A transport with a negotiated offer in flight: the socket is the session socket too. */
async function started(overrides: Partial<WebRtcTransportDeps> = {}) {
  const made = setup(overrides);
  const socket = socketStub();
  made.session.ws = socket;
  made.session.state.connected = true;
  await made.transport.startWebRtcTransport(3, socket);
  return { ...made, socket, peer: FakeRTCPeerConnection.instances.at(-1)! };
}

beforeEach(() => {
  setActivePinia(createPinia());
  stubs = installBrowserStubs();
  ctx = new FakeAudioContext();
  micStream = new FakeMediaStream([new FakeMediaStreamTrack("audio")]);
  processedStream = null;
  order = [];
  window.localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  delete (HTMLMediaElement.prototype as unknown as Record<string, unknown>).srcObject;
  document.body.replaceChildren();
  stubs.restore();
  vi.restoreAllMocks();
});

describe("startWebRtcTransport", () => {
  it("throws without RTCPeerConnection", async () => {
    delete (globalThis as Record<string, unknown>).RTCPeerConnection;
    const { transport } = setup();
    await expect(transport.startWebRtcTransport(3, socketStub())).rejects.toThrow("当前浏览器不支持 WebRTC");
  });

  it("does nothing when the sequence moved on, the socket closed or no microphone is open", async () => {
    const stale = setup();
    await stale.transport.startWebRtcTransport(2, socketStub());
    const closed = setup();
    await closed.transport.startWebRtcTransport(3, socketStub(3));
    micStream = null;
    const noMic = setup();
    await noMic.transport.startWebRtcTransport(3, socketStub());
    expect(FakeRTCPeerConnection.instances).toHaveLength(0);
    expect(stale.deps.ensureMicrophone).toHaveBeenCalledTimes(1);
  });

  it("throws when the microphone stream has no audio track", async () => {
    micStream = new FakeMediaStream([]);
    const { transport } = setup();
    await expect(transport.startWebRtcTransport(3, socketStub())).rejects.toThrow("没有可用的麦克风音轨");
  });

  it("stops the PCM capture, sends the mixed track and offers over the socket", async () => {
    const { audio, deps, socket, peer } = await started();
    audio.accompanimentActive = true;
    expect(order).toEqual(["captureGraph"]);
    expect(peer.config).toEqual({ iceServers: [] });
    expect(deps.webrtcActive.value).toBe(true);
    const [frame] = socket.send.mock.calls[0]!;
    expect(JSON.parse(String(frame))).toEqual({
      type: "webrtcOffer",
      payload: { sdp: { type: "offer", sdp: "fake-offer" }, muted: false, accompanimentActive: false },
    });
  });

  it("mutes the microphone track and the mix gain while muted, and reports it in the offer", async () => {
    const audioStore = useVoiceAudioStore();
    audioStore.microphoneMuted = true;
    const { socket } = await started();
    const track = micStream!.getAudioTracks()[0]!;
    expect(track.enabled).toBe(false);
    expect(ctx.gains[0]!.gain.value).toBe(0);
    expect(JSON.parse(String(socket.send.mock.calls[0]![0])).payload.muted).toBe(true);
  });

  it("mixes the processed microphone at the input volume", async () => {
    processedStream = new FakeMediaStream([new FakeMediaStreamTrack("audio")]);
    const audioStore = useVoiceAudioStore();
    audioStore.inputVolume = 0.6;
    const sources = recordSources();
    const { transport } = await started();
    expect(sources[0]).toBe(processedStream);
    expect(transport.getWebRtcMixMicGain()).toBe(ctx.gains[0]);
    expect(ctx.gains[0]!.gain.value).toBe(0.6);
  });

  it("plays the remote track through a hidden autoplaying element at the output volume", async () => {
    looseSrcObject();
    const { deps, peer } = await started();
    const remote = new FakeMediaStream([new FakeMediaStreamTrack("audio")]);
    useVoiceAudioStore().selectedOutputDeviceId = "spk";
    order.length = 0;
    peer.ontrack?.({ streams: [remote], track: remote.getTracks()[0] });
    const element = document.body.querySelector("audio") as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    expect(order).toEqual(["playback"]);
    expect(element.autoplay).toBe(true);
    expect(element.volume).toBe(0.5);
    expect(element.getAttribute("aria-hidden")).toBe("true");
    expect(element.tabIndex).toBe(-1);
    expect(element.style.position).toBe("fixed");
    expect(element.style.pointerEvents).toBe("none");
    expect(element.srcObject).toBe(remote);
    expect(deps.attachWebRtcPlayback).toHaveBeenCalledWith(element, remote);
    expect(deps.syncWebRtcPlayback).toHaveBeenCalledTimes(1);
  });

  it("falls back to a stream built from the track when the event carries none", async () => {
    looseSrcObject();
    const { deps, peer } = await started();
    const track = new FakeMediaStreamTrack("audio");
    peer.ontrack?.({ streams: [], track });
    const [, stream] = deps.attachWebRtcPlayback.mock.calls[0]!;
    expect((stream as unknown as FakeMediaStream).getTracks()).toEqual([track]);
  });

  it("falls back to the PCM path when the peer connection fails", async () => {
    const { deps, peer, socket } = await started();
    peer.connectionState = "connected";
    peer.onconnectionstatechange?.();
    expect(sentTypes(socket)).toEqual(["webrtcOffer"]);
    peer.connectionState = "failed";
    peer.onconnectionstatechange?.();
    await vi.waitFor(() => expect(sentTypes(socket)).toContain("webrtcStop"));
    expect(deps.setAudioNotice).toHaveBeenCalledWith("WEBRTC_FALLBACK", expect.stringContaining("WEBRTC_CONNECTION_FAILED"));
  });

  it("falls back after eight seconds without an answer, but not once an answer was applied", async () => {
    vi.useFakeTimers();
    const silent = await started();
    await vi.advanceTimersByTimeAsync(7_999);
    expect(sentTypes(silent.socket)).toEqual(["webrtcOffer"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(sentTypes(silent.socket)).toContain("webrtcStop");
    expect(silent.deps.setAudioNotice).toHaveBeenCalledWith("WEBRTC_FALLBACK", expect.stringContaining("WEBRTC_ANSWER_TIMEOUT"));

    const answered = await started();
    await answered.transport.applyWebRtcAnswer({ type: "answer", sdp: "x" });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sentTypes(answered.socket)).toEqual(["webrtcOffer"]);
  });

  it("falls back and rethrows when the negotiation fails", async () => {
    const failure = new Error("no offer");
    vi.spyOn(FakeRTCPeerConnection.prototype, "createOffer").mockRejectedValueOnce(failure);
    const made = setup();
    const socket = socketStub();
    made.session.ws = socket;
    made.session.state.connected = true;
    await expect(made.transport.startWebRtcTransport(3, socket)).rejects.toBe(failure);
    expect(sentTypes(socket)).toEqual(["webrtcStop"]);
    expect(made.deps.setAudioNotice).toHaveBeenCalledWith("WEBRTC_FALLBACK", expect.stringContaining("WEBRTC_NEGOTIATION_FAILED"));
  });

  it("sends no offer when the sequence moved on during negotiation", async () => {
    let sequence = 3;
    const made = setup({ connectionSequence: () => sequence });
    const socket = socketStub();
    vi.spyOn(FakeRTCPeerConnection.prototype, "createOffer").mockImplementationOnce(async () => { sequence = 4; return { type: "offer", sdp: "x" }; });
    await made.transport.startWebRtcTransport(3, socket);
    expect(socket.send).not.toHaveBeenCalled();
  });
});

describe("applyWebRtcAnswer", () => {
  it("ignores an answer without a peer or with a malformed description", async () => {
    const idle = setup();
    await idle.transport.applyWebRtcAnswer({ type: "answer", sdp: "x" });
    expect(idle.deps.webrtcActive.value).toBe(false);

    const { transport, peer } = await started();
    await transport.applyWebRtcAnswer({ type: "offer", sdp: "x" });
    await transport.applyWebRtcAnswer({ type: "answer" });
    await transport.applyWebRtcAnswer(null);
    expect(peer.remoteDescription).toBeNull();
  });

  it("applies the answer and re-sends the stored member volumes", async () => {
    const { audio, deps, transport, peer } = await started();
    audio.volumes[5] = 1.5;
    audio.volumes[0] = 2;
    audio.volumes[-3] = 2;
    audio.volumes[7] = 0.5;
    await transport.applyWebRtcAnswer({ type: "answer", sdp: "sdp" });
    expect(peer.remoteDescription).toEqual({ type: "answer", sdp: "sdp" });
    expect(deps.webrtcActive.value).toBe(true);
    expect(deps.sendCmd.mock.calls).toEqual([
      ["setMemberVolume", { clientId: 5, volume: 1.5 }],
      ["setMemberVolume", { clientId: 7, volume: 0.5 }],
    ]);
  });

  it("falls back when the answer is rejected, and only with a known connection", async () => {
    vi.spyOn(FakeRTCPeerConnection.prototype, "setRemoteDescription").mockRejectedValue(new Error("bad answer"));
    const { deps, socket, transport } = await started();
    await transport.applyWebRtcAnswer({ type: "answer", sdp: "x" });
    expect(sentTypes(socket)).toContain("webrtcStop");
    expect(deps.setAudioNotice).toHaveBeenCalledWith("WEBRTC_FALLBACK", expect.stringContaining("WEBRTC_ANSWER_REJECTED"));

    const unknown = await started({ hasLastConnection: () => false });
    await unknown.transport.applyWebRtcAnswer({ type: "answer", sdp: "x" });
    expect(sentTypes(unknown.socket)).toEqual(["webrtcOffer"]);
  });
});

describe("syncWebRtcMemberVolumes", () => {
  it("sends nothing unless WebRTC is active and the socket is open", async () => {
    const { audio, deps, session, transport } = await started();
    audio.volumes[5] = 1.5;
    deps.webrtcActive.value = false;
    transport.syncWebRtcMemberVolumes();
    expect(deps.sendCmd).not.toHaveBeenCalled();
    deps.webrtcActive.value = true;
    session.ws = socketStub(0);
    transport.syncWebRtcMemberVolumes();
    expect(deps.sendCmd).not.toHaveBeenCalled();
    session.ws = socketStub();
    transport.syncWebRtcMemberVolumes();
    expect(deps.sendCmd).toHaveBeenCalledWith("setMemberVolume", { clientId: 5, volume: 1.5 });
  });
});

describe("fallbackFromWebRtc", () => {
  it("tells the gateway, tears the transport down, explains it and restarts the PCM microphone", async () => {
    const { deps, session, socket, peer, transport } = await started();
    session.state.connected = true;
    order.length = 0;
    await transport.fallbackFromWebRtc(3, socket);
    expect(sentTypes(socket)).toEqual(["webrtcOffer", "webrtcStop"]);
    expect(deps.webrtcActive.value).toBe(false);
    expect(peer.closed).toBe(true);
    expect(order).toEqual(["playback"]);
    expect(deps.setAudioNotice).toHaveBeenCalledWith("WEBRTC_FALLBACK", expect.stringContaining("WEBRTC_UNAVAILABLE"));
    expect(deps.startMicrophone).toHaveBeenCalledTimes(1);
  });

  it("stays silent outside a room or on a closed socket", async () => {
    const { deps, session, socket, transport } = await started();
    session.state.connected = false;
    await transport.fallbackFromWebRtc(3, socket);
    expect(deps.setAudioNotice).not.toHaveBeenCalled();
    expect(deps.startMicrophone).not.toHaveBeenCalled();
  });

  it("reports a failed microphone restart as a microphone error", async () => {
    const failure = new Error("busy");
    const { deps, session, socket, transport } = await started({ startMicrophone: vi.fn(async () => { throw failure; }) });
    session.state.connected = true;
    await transport.fallbackFromWebRtc(3, socket);
    expect(deps.setMicrophoneError).toHaveBeenCalledWith(failure);
  });

  it("runs once per transport, ignores a stale sequence, and a new transport re-arms it", async () => {
    const { deps, session, socket, transport } = await started();
    session.state.connected = true;
    await transport.fallbackFromWebRtc(2, socket);
    expect(sentTypes(socket)).toEqual(["webrtcOffer"]);
    await transport.fallbackFromWebRtc(3, socket);
    await transport.fallbackFromWebRtc(3, socket);
    expect(sentTypes(socket)).toEqual(["webrtcOffer", "webrtcStop"]);
    expect(deps.startMicrophone).toHaveBeenCalledTimes(1);
    await transport.startWebRtcTransport(3, socket);
    await transport.fallbackFromWebRtc(3, socket);
    expect(sentTypes(socket).filter((type) => type === "webrtcStop")).toHaveLength(2);
  });

  it("puts a safe reason code in the notice", async () => {
    const { deps, session, socket, transport } = await started();
    session.state.connected = true;
    await transport.fallbackFromWebRtc(3, socket, "WEBRTC_X");
    expect(deps.setAudioNotice.mock.calls[0]![1]).toContain("WEBRTC_X");
  });
});

describe("stopWebRtcTransport", () => {
  it("releases accompaniment, the mix, the monitor and playback, then closes the peer", async () => {
    const { deps, peer, transport } = await started();
    const shared = await shareAccompaniment(peer, transport);
    deps.micLevel.value = 0.4;
    order.length = 0;
    const mixGain = transport.getWebRtcMixMicGain()!;
    transport.stopWebRtcTransport();
    expect(order).toEqual(["playback"]);
    expect(shared.audio.stopped).toBe(true);
    expect(useVoiceAudioStore().accompanimentActive).toBe(false);
    expect((mixGain as unknown as { disconnected: boolean }).disconnected).toBe(true);
    expect(transport.getWebRtcMixMicGain()).toBeNull();
    expect(transport.getWebRtcPeer()).toBeNull();
    expect(deps.webrtcActive.value).toBe(false);
    expect(deps.micLevel.value).toBe(0);
    expect(peer.closed).toBe(true);
  });

  it("releases the accompaniment before the mix goes away", async () => {
    const { peer, transport } = await started();
    const shared = await shareAccompaniment(peer, transport);
    const mixGain = transport.getWebRtcMixMicGain() as unknown as { disconnected: boolean };
    let mixGoneAtRelease: boolean | null = null;
    shared.audio.stop = () => { mixGoneAtRelease = mixGain.disconnected; };
    transport.stopWebRtcTransport();
    expect(mixGoneAtRelease).toBe(false);
    expect(mixGain.disconnected).toBe(true);
  });

  it("is harmless without a peer", () => {
    const { transport } = setup();
    expect(() => transport.stopWebRtcTransport()).not.toThrow();
    expect(useVoiceAudioStore().accompanimentActive).toBe(false);
  });
});

describe("accompaniment", () => {
  function displayMedia(fn: () => Promise<FakeMediaStream>): void {
    (navigator.mediaDevices as unknown as { getDisplayMedia: () => Promise<FakeMediaStream> }).getDisplayMedia = fn;
  }

  it("needs browser support, and says so", async () => {
    const { audio, transport } = await started();
    audio.accompanimentSupported = false;
    await expect(transport.startAccompaniment()).rejects.toThrow("伴奏共享不可用");
    expect(audio.accompanimentErrorCode).toBe("unsupported");
  });

  it("needs an active WebRTC transport with a peer and a microphone", async () => {
    const idle = setup();
    idle.audio.accompanimentSupported = true;
    await expect(idle.transport.startAccompaniment()).rejects.toThrow("伴奏功能需要启用 WebRTC");
    expect(idle.audio.accompanimentErrorCode).toBe("needsWebRtc");

    const { audio, deps, transport } = await started();
    audio.accompanimentSupported = true;
    deps.webrtcActive.value = false;
    await expect(transport.startAccompaniment()).rejects.toThrow("伴奏功能需要启用 WebRTC");
    deps.webrtcActive.value = true;
    micStream = null;
    await expect(transport.startAccompaniment()).rejects.toThrow("伴奏功能需要启用 WebRTC");
  });

  it("keeps the audio, drops the video, turns voice processing off and tags the track as music", async () => {
    const { audio, deps, peer, transport } = await started();
    audio.accompanimentSupported = true;
    const shared = await shareAccompaniment(peer, transport);
    expect(shared.video.stopped).toBe(true);
    expect(shared.audio.stopped).toBe(false);
    expect(shared.audio.applyConstraints).toHaveBeenCalledWith({ autoGainControl: false, echoCancellation: false, noiseSuppression: false });
    expect(shared.audio.contentHint).toBe("music");
    expect(audio.accompanimentActive).toBe(true);
    expect(audio.accompanimentErrorCode).toBe("");
    expect(deps.sendCmd).toHaveBeenCalledWith("setAccompanimentActive", { active: true });
    expect(shared.replaceTrack).toHaveBeenCalledTimes(1);
  });

  it("asks the browser for own-tab exclusion and system audio, and hints restrictOwnAudio only where supported", async () => {
    const { audio, peer, transport } = await started();
    audio.accompanimentSupported = true;
    const options: unknown[] = [];
    const devices = navigator.mediaDevices as unknown as { getSupportedConstraints: () => Record<string, boolean> };
    devices.getSupportedConstraints = () => ({ restrictOwnAudio: true });
    displayMedia(async (...args: unknown[]) => { options.push(args[0]); return new FakeMediaStream([new FakeDisplayTrack("audio")]); });
    vi.spyOn(peer, "getSenders").mockReturnValue([{ track: { kind: "audio" }, replaceTrack: async () => undefined }] as unknown as RTCRtpSender[]);
    await transport.startAccompaniment();
    devices.getSupportedConstraints = () => ({});
    await transport.startAccompaniment();
    expect(options[0]).toMatchObject({
      video: { displaySurface: "browser" }, selfBrowserSurface: "exclude", systemAudio: "include", windowAudio: "window",
      audio: { autoGainControl: false, echoCancellation: false, noiseSuppression: false, restrictOwnAudio: true },
    });
    expect((options[1] as { audio: object }).audio).not.toHaveProperty("restrictOwnAudio");
  });

  it("does nothing when the picker is dismissed, and reports a refused capture as a permission problem", async () => {
    const { audio, deps, transport } = await started();
    audio.accompanimentSupported = true;
    displayMedia(async () => { throw new DOMException("dismissed", "AbortError"); });
    await expect(transport.startAccompaniment()).resolves.toBeUndefined();
    expect(audio.accompanimentErrorCode).toBe("");
    expect(audio.accompanimentActive).toBe(false);
    displayMedia(async () => { throw new DOMException("no", "NotAllowedError"); });
    await expect(transport.startAccompaniment()).rejects.toBeInstanceOf(DOMException);
    expect(audio.accompanimentErrorCode).toBe("permission");
    expect(deps.sendCmd).not.toHaveBeenCalled();
  });

  it("rejects a source without audio and stops everything it was given", async () => {
    const { audio, transport } = await started();
    audio.accompanimentSupported = true;
    const video = new FakeMediaStreamTrack("video");
    displayMedia(async () => new FakeMediaStream([video]));
    await expect(transport.startAccompaniment()).rejects.toThrow("所选来源没有可共享音频");
    expect(video.stopped).toBe(true);
    expect(audio.accompanimentErrorCode).toBe("noAudio");
    expect(audio.accompanimentActive).toBe(false);
  });

  it("shares on when the browser refuses one of the processing constraints", async () => {
    const { audio, peer, transport } = await started();
    audio.accompanimentSupported = true;
    const track = new FakeDisplayTrack("audio");
    track.applyConstraints.mockRejectedValue(new Error("optional"));
    displayMedia(async () => new FakeMediaStream([track]));
    vi.spyOn(peer, "getSenders").mockReturnValue([{ track: { kind: "audio" }, replaceTrack: async () => undefined }] as unknown as RTCRtpSender[]);
    await transport.startAccompaniment();
    expect(audio.accompanimentActive).toBe(true);
  });

  it("mixes the shared audio next to the microphone, at source level", async () => {
    const { audio, peer, transport } = await started();
    audio.accompanimentSupported = true;
    const sources = recordSources();
    const shared = await shareAccompaniment(peer, transport);
    expect(sources).toHaveLength(2); // microphone, accompaniment
    expect((sources[1] as FakeMediaStream).getAudioTracks()).toEqual([shared.audio]);
    expect(ctx.gains).toHaveLength(3); // the first mix's mic gain, the monitor's silent gain, the second mix's mic gain: none for the accompaniment
  });

  it("replaces a previous share, stopping its tracks", async () => {
    const { audio, peer, transport } = await started();
    audio.accompanimentSupported = true;
    const first = await shareAccompaniment(peer, transport);
    await shareAccompaniment(peer, transport);
    expect(first.audio.stopped).toBe(true);
  });

  it("stops by itself when the browser ends the share, and tells the gateway", async () => {
    const { audio, deps, peer, transport } = await started();
    audio.accompanimentSupported = true;
    const shared = await shareAccompaniment(peer, transport);
    deps.sendCmd.mockClear();
    shared.replaceTrack.mockClear();
    shared.audio.end();
    await vi.waitFor(() => expect(shared.replaceTrack).toHaveBeenCalledTimes(1));
    expect(shared.audio.stopped).toBe(true);
    expect(audio.accompanimentActive).toBe(false);
    expect(deps.sendCmd).toHaveBeenCalledWith("setAccompanimentActive", { active: false });
  });

  it("undoes the share when the mix cannot be put on the sender", async () => {
    const { audio, deps, transport } = await started();
    audio.accompanimentSupported = true;
    displayMedia(async () => new FakeMediaStream([new FakeDisplayTrack("audio")]));
    await expect(transport.startAccompaniment()).rejects.toThrow("WebRTC 音频轨道尚未就绪");
    expect(audio.accompanimentActive).toBe(false);
    expect(audio.accompanimentErrorCode).toBe("permission");
    expect(deps.sendCmd).toHaveBeenLastCalledWith("setAccompanimentActive", { active: false });
    expect(transport.getWebRtcMixMicGain()).toBeNull();
  });

  it("stopAccompaniment without WebRTC only drops the mix and tells no one", async () => {
    const { audio, deps, transport } = await started();
    audio.accompanimentErrorCode = "permission";
    deps.webrtcActive.value = false;
    deps.sendCmd.mockClear();
    await transport.stopAccompaniment();
    expect(audio.accompanimentErrorCode).toBe("");
    expect(deps.sendCmd).not.toHaveBeenCalled();
    expect(transport.getWebRtcMixMicGain()).toBeNull();
  });
});

describe("mix stream", () => {
  it("replaceWebRtcAudioTrack puts a fresh mix on the audio sender", async () => {
    const { peer, transport } = await started();
    const replaceTrack = vi.fn(async () => undefined);
    vi.spyOn(peer, "getSenders").mockReturnValue([{ track: { kind: "video" } }, { track: { kind: "audio" }, replaceTrack }] as unknown as RTCRtpSender[]);
    const before = transport.getWebRtcMixMicGain();
    await transport.replaceWebRtcAudioTrack();
    expect(replaceTrack).toHaveBeenCalledTimes(1);
    expect(transport.getWebRtcMixMicGain()).not.toBe(before);
    expect((before as unknown as { disconnected: boolean }).disconnected).toBe(true);
  });

  it("replaceWebRtcAudioTrack needs a peer and a microphone, and throws when the sender is not there yet", async () => {
    const idle = setup();
    await expect(idle.transport.replaceWebRtcAudioTrack()).resolves.toBeUndefined();
    const { transport } = await started();
    await expect(transport.replaceWebRtcAudioTrack()).rejects.toThrow("WebRTC 音频轨道尚未就绪");
  });

  it("stopWebRtcMix disconnects the mix and forgets the microphone gain", async () => {
    const { transport } = await started();
    transport.stopWebRtcMix();
    expect(transport.getWebRtcMixMicGain()).toBeNull();
  });
});

describe("microphone monitor", () => {
  function analyserReading(value: number): void {
    vi.spyOn(FakeAnalyserNode.prototype, "getFloatTimeDomainData").mockImplementation((target: Float32Array) => { target.fill(value); });
  }

  it("reports the level every 50 ms, scaled by six and capped at one", async () => {
    vi.useFakeTimers();
    analyserReading(0.05);
    const { deps } = await started();
    await vi.advanceTimersByTimeAsync(49);
    expect(deps.micLevel.value).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(deps.micLevel.value).toBeCloseTo(0.3);
    analyserReading(0.5);
    await vi.advanceTimersByTimeAsync(50);
    expect(deps.micLevel.value).toBe(1);
  });

  it("marks the own client speaking above the VOX threshold and clears it below", async () => {
    vi.useFakeTimers();
    analyserReading(0.5);
    const made = setup();
    made.session.state.tsClientId = 9;
    made.audio.voxThreshold = 0.1;
    const socket = socketStub();
    made.session.ws = socket;
    await made.transport.startWebRtcTransport(3, socket);
    await vi.advanceTimersByTimeAsync(50);
    expect(made.deps.markSpeaking).toHaveBeenCalledWith(9);
    analyserReading(0.01);
    await vi.advanceTimersByTimeAsync(50);
    expect(made.deps.clearSpeaking).toHaveBeenCalledWith(9);
  });

  it("does not mark speaking while muted or when the track is disabled", async () => {
    vi.useFakeTimers();
    analyserReading(0.5);
    const made = setup();
    made.session.state.tsClientId = 9;
    made.audio.microphoneMuted = true;
    const socket = socketStub();
    await made.transport.startWebRtcTransport(3, socket);
    await vi.advanceTimersByTimeAsync(50);
    expect(made.deps.markSpeaking).not.toHaveBeenCalled();
    expect(made.deps.clearSpeaking).toHaveBeenCalledWith(9);
  });

  it("does not mark speaking while the microphone track is disabled", async () => {
    vi.useFakeTimers();
    analyserReading(0.5);
    const made = setup();
    made.session.state.tsClientId = 9;
    const socket = socketStub();
    await made.transport.startWebRtcTransport(3, socket);
    micStream!.getAudioTracks()[0]!.enabled = false;
    await vi.advanceTimersByTimeAsync(50);
    expect(made.deps.markSpeaking).not.toHaveBeenCalled();
    expect(made.deps.clearSpeaking).toHaveBeenCalledWith(9);
  });

  it("stops on transport stop", async () => {
    vi.useFakeTimers();
    analyserReading(0.5);
    const { deps, transport } = await started();
    transport.stopWebRtcTransport();
    deps.micLevel.value = 0;
    await vi.advanceTimersByTimeAsync(500);
    expect(deps.micLevel.value).toBe(0);
  });

  it("gives up quietly when the analyser graph cannot be built", async () => {
    vi.spyOn(ctx, "createAnalyser").mockImplementation(() => { throw new Error("no analyser"); });
    const { peer } = await started();
    expect(peer.closed).toBe(false);
  });
});

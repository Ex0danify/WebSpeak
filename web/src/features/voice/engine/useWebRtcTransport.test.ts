// useWebRtcTransport on its own: stores, browser stubs and stub deps, no composable around it.
// The wire messages (webrtcOffer, webrtcAnswer, webrtcError) are also pinned by messages.connection.test.ts.
// The accompaniment lives in useWebRtcAccompaniment.test.ts, the microphone monitor in useWebRtcTransport.micMonitor.test.ts.
import { describe, expect, it, vi } from "vitest";
import { useVoiceAudioStore } from "@/features/voice/stores/voiceAudioStore";
import { FakeMediaStream, FakeMediaStreamTrack, FakeRTCPeerConnection } from "@/testSupport/browserStubs";
import {
  looseSrcObject,
  recordSources,
  rtc,
  sentTypes,
  setup,
  shareAccompaniment,
  socketStub,
  started,
  useTransportFixture,
} from "@/testSupport/webRtcTransportFixture";

useTransportFixture();

describe("startWebRtcTransport", () => {
  it("throws without RTCPeerConnection", async () => {
    delete (globalThis as Record<string, unknown>).RTCPeerConnection;
    const { transport } = setup();
    await expect(transport.startWebRtcTransport(3, socketStub())).rejects.toThrow("This browser does not support WebRTC");
  });

  it("does nothing when the sequence moved on, the socket closed or no microphone is open", async () => {
    const stale = setup();
    await stale.transport.startWebRtcTransport(2, socketStub());
    const closed = setup();
    await closed.transport.startWebRtcTransport(3, socketStub(3));
    rtc.micStream = null;
    const noMic = setup();
    await noMic.transport.startWebRtcTransport(3, socketStub());
    expect(FakeRTCPeerConnection.instances).toHaveLength(0);
    expect(stale.deps.ensureMicrophone).toHaveBeenCalledTimes(1);
  });

  it("throws when the microphone stream has no audio track", async () => {
    rtc.micStream = new FakeMediaStream([]);
    const { transport } = setup();
    await expect(transport.startWebRtcTransport(3, socketStub())).rejects.toThrow("No microphone track is available");
  });

  it("stops the PCM capture, sends the mixed track and offers over the socket", async () => {
    const { audio, deps, socket, peer } = await started();
    audio.accompanimentActive = true;
    expect(rtc.order).toEqual(["captureGraph"]);
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
    const track = rtc.micStream!.getAudioTracks()[0]!;
    expect(track.enabled).toBe(false);
    expect(rtc.ctx.gains[0]!.gain.value).toBe(0);
    expect(JSON.parse(String(socket.send.mock.calls[0]![0])).payload.muted).toBe(true);
  });

  it("mixes the processed microphone at the input volume", async () => {
    rtc.processedStream = new FakeMediaStream([new FakeMediaStreamTrack("audio")]);
    const audioStore = useVoiceAudioStore();
    audioStore.inputVolume = 0.6;
    const sources = recordSources();
    const { transport } = await started();
    expect(sources[0]).toBe(rtc.processedStream);
    expect(transport.getWebRtcMixMicGain()).toBe(rtc.ctx.gains[0]);
    expect(rtc.ctx.gains[0]!.gain.value).toBe(0.6);
  });

  it("plays the remote track through a hidden autoplaying element at the output volume", async () => {
    looseSrcObject();
    const { deps, peer } = await started();
    const remote = new FakeMediaStream([new FakeMediaStreamTrack("audio")]);
    useVoiceAudioStore().selectedOutputDeviceId = "spk";
    rtc.order.length = 0;
    peer.ontrack?.({ streams: [remote], track: remote.getTracks()[0] });
    const element = document.body.querySelector("audio") as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    expect(rtc.order).toEqual(["playback"]);
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
    expect(deps.setAudioNotice).toHaveBeenCalledWith("WEBRTC_FALLBACK", { code: "WEBRTC_CONNECTION_FAILED" });
  });

  it("falls back after eight seconds without an answer, but not once an answer was applied", async () => {
    vi.useFakeTimers();
    const silent = await started();
    await vi.advanceTimersByTimeAsync(7_999);
    expect(sentTypes(silent.socket)).toEqual(["webrtcOffer"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(sentTypes(silent.socket)).toContain("webrtcStop");
    expect(silent.deps.setAudioNotice).toHaveBeenCalledWith("WEBRTC_FALLBACK", { code: "WEBRTC_ANSWER_TIMEOUT" });

    const answered = await started();
    await answered.transport.applyWebRtcAnswer({ type: "answer", sdp: "x" });
    answered.peer.connectionState = "connected";
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sentTypes(answered.socket)).toEqual(["webrtcOffer"]);
  });

  it("falls back when ICE has not connected ten seconds after the answer", async () => {
    vi.useFakeTimers();
    const { deps, peer, socket, transport } = await started();
    await transport.applyWebRtcAnswer({ type: "answer", sdp: "x" });
    peer.connectionState = "connecting";
    await vi.advanceTimersByTimeAsync(9_999);
    expect(sentTypes(socket)).toEqual(["webrtcOffer"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(sentTypes(socket)).toContain("webrtcStop");
    expect(deps.setAudioNotice).toHaveBeenCalledWith("WEBRTC_FALLBACK", { code: "WEBRTC_CONNECT_TIMEOUT" });
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
    expect(made.deps.setAudioNotice).toHaveBeenCalledWith("WEBRTC_FALLBACK", { code: "WEBRTC_NEGOTIATION_FAILED" });
  });

  it("sends no offer when the sequence moved on during negotiation", async () => {
    let sequence = 3;
    const made = setup({ connectionSequence: () => sequence });
    const socket = socketStub();
    vi.spyOn(FakeRTCPeerConnection.prototype, "createOffer").mockImplementationOnce(async () => {
      sequence = 4;
      return { type: "offer", sdp: "x" };
    });
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
    expect(deps.setAudioNotice).toHaveBeenCalledWith("WEBRTC_FALLBACK", { code: "WEBRTC_ANSWER_REJECTED" });

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
    rtc.order.length = 0;
    await transport.fallbackFromWebRtc(3, socket);
    expect(sentTypes(socket)).toEqual(["webrtcOffer", "webrtcStop"]);
    expect(deps.webrtcActive.value).toBe(false);
    expect(peer.closed).toBe(true);
    expect(rtc.order).toEqual(["playback"]);
    expect(deps.setAudioNotice).toHaveBeenCalledWith("WEBRTC_FALLBACK", { code: "WEBRTC_UNAVAILABLE" });
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
    const { deps, session, socket, transport } = await started({
      startMicrophone: vi.fn(async () => {
        throw failure;
      }),
    });
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
    expect(deps.setAudioNotice).toHaveBeenCalledWith("WEBRTC_FALLBACK", { code: "WEBRTC_X" });
  });
});

describe("stopWebRtcTransport", () => {
  it("releases accompaniment, the mix, the monitor and playback, then closes the peer", async () => {
    const { deps, peer, transport } = await started();
    const shared = await shareAccompaniment(peer, transport);
    deps.micLevel.value = 0.4;
    rtc.order.length = 0;
    const mixGain = transport.getWebRtcMixMicGain()!;
    transport.stopWebRtcTransport();
    expect(rtc.order).toEqual(["playback"]);
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
    shared.audio.stop = () => {
      mixGoneAtRelease = mixGain.disconnected;
    };
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

describe("mix stream", () => {
  it("replaceWebRtcAudioTrack puts a fresh mix on the audio sender", async () => {
    const { peer, transport } = await started();
    const replaceTrack = vi.fn(async () => undefined);
    vi.spyOn(peer, "getSenders").mockReturnValue([
      { track: { kind: "video" } },
      { track: { kind: "audio" }, replaceTrack },
    ] as unknown as RTCRtpSender[]);
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
    await expect(transport.replaceWebRtcAudioTrack()).rejects.toThrow("The WebRTC audio track is not ready");
  });

  it("stopWebRtcMix disconnects the mix and forgets the microphone gain", async () => {
    const { transport } = await started();
    transport.stopWebRtcMix();
    expect(transport.getWebRtcMixMicGain()).toBeNull();
  });
});

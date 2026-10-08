// The accompaniment (shared display audio) mixed into the WebRTC stream, driven through the transport that owns the peer.
import { describe, expect, it, vi } from "vitest";
import { FakeMediaStream, FakeMediaStreamTrack } from "@/testSupport/browserStubs";
import { FakeDisplayTrack, recordSources, rtc, setup, shareAccompaniment, started, useTransportFixture } from "@/testSupport/webRtcTransportFixture";
import { useVoiceAudioStore } from "../stores/voiceAudioStore";

useTransportFixture();

describe("accompaniment", () => {
  function displayMedia(fn: () => Promise<FakeMediaStream>): void {
    (navigator.mediaDevices as unknown as { getDisplayMedia: () => Promise<FakeMediaStream> }).getDisplayMedia = fn;
  }

  it("needs browser support, and says so", async () => {
    const { audio, transport } = await started();
    audio.accompanimentSupported = false;
    await expect(transport.startAccompaniment()).rejects.toThrow("Accompaniment sharing is unavailable");
    expect(audio.accompanimentErrorCode).toBe("unsupported");
  });

  it("needs an active WebRTC transport with a peer and a microphone", async () => {
    const idle = setup();
    idle.audio.accompanimentSupported = true;
    await expect(idle.transport.startAccompaniment()).rejects.toThrow("Accompaniment needs WebRTC");
    expect(idle.audio.accompanimentErrorCode).toBe("needsWebRtc");

    const { audio, deps, transport } = await started();
    audio.accompanimentSupported = true;
    deps.webrtcActive.value = false;
    await expect(transport.startAccompaniment()).rejects.toThrow("Accompaniment needs WebRTC");
    deps.webrtcActive.value = true;
    rtc.micStream = null;
    await expect(transport.startAccompaniment()).rejects.toThrow("Accompaniment needs WebRTC");
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
    await expect(transport.startAccompaniment()).rejects.toThrow("The selected source has no audio to share");
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
    expect(rtc.ctx.gains).toHaveLength(3); // the first mix's mic gain, the monitor's silent gain, the second mix's mic gain: none for the accompaniment
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
    await expect(transport.startAccompaniment()).rejects.toThrow("The WebRTC audio track is not ready");
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

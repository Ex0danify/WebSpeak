import { afterEach, describe, expect, it, vi } from "vitest";
import { RTCPeerConnection, useOPUS } from "werift";
import type { Logger } from "../../../shared/logger.js";
import { WebRtcAudioSession } from "./webrtcAudioSession.js";

const logger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return logger;
  },
};

const open: { close(): Promise<unknown> }[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((item) => item.close()));
});

async function connectedPair() {
  const session = new WebRtcAudioSession({ connectionId: "ice", logger, onVoiceFrame() {}, onVoiceActivity() {} });
  const browser = new RTCPeerConnection({ iceServers: [], codecs: { audio: [useOPUS()] } });
  open.push(session, browser);
  browser.addTransceiver("audio", { direction: "sendrecv" });
  await browser.setLocalDescription(await browser.createOffer());
  const answer = await session.createAnswer({ type: "offer", sdp: browser.localDescription!.sdp });
  await browser.setRemoteDescription(answer);
  await vi.waitFor(() => expect(session.peer.connectionState).toBe("connected"), { timeout: 8000 });
  return session;
}

describe("the ICE result of a WebRTC session", () => {
  it("has no result before anything happened", () => {
    const session = new WebRtcAudioSession({ connectionId: "ice", logger, onVoiceFrame() {}, onVoiceActivity() {} });
    open.push(session);
    expect(session.getStats().webrtcIce).toBeNull();
  });

  it("names the path of a connected session and keeps it after the peer closed", async () => {
    const session = await connectedPair();
    expect(session.getStats().webrtcIce).toMatchObject({
      state: "connected",
      localType: expect.stringMatching(/^(host|srflx|prflx|relay)$/),
      remoteType: expect.stringMatching(/^(host|srflx|prflx|relay)$/),
      protocol: "udp",
      connectMs: expect.any(Number),
    });
    await session.close();
    expect(session.getStats().webrtcIce).toMatchObject({
      state: "connected",
      remoteType: expect.any(String),
      protocol: "udp",
      connectMs: expect.any(Number),
    });
  });

  it("records a session whose browser never completed ICE, without a path, which is what a blocked UDP range looks like", async () => {
    const session = new WebRtcAudioSession({ connectionId: "ice", logger, onVoiceFrame() {}, onVoiceActivity() {} });
    const browser = new RTCPeerConnection({ iceServers: [], codecs: { audio: [useOPUS()] } });
    open.push(session, browser);
    browser.addTransceiver("audio", { direction: "sendrecv" });
    await browser.setLocalDescription(await browser.createOffer());
    await session.createAnswer({ type: "offer", sdp: browser.localDescription!.sdp });
    await session.close();
    expect(session.getStats().webrtcIce).toMatchObject({
      state: expect.stringMatching(/^(new|connecting)$/),
      remoteType: null,
      protocol: null,
      rttMs: null,
      connectMs: null,
    });
  });
});

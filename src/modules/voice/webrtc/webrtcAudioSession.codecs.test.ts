import { afterEach, describe, expect, it } from "vitest";
import { RTCPeerConnection, useOPUS, usePCMU } from "werift";
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

const newSession = () => {
  const session = new WebRtcAudioSession({ connectionId: "codecs", logger, onVoiceFrame() {}, onVoiceActivity() {} });
  open.push(session);
  return session;
};

async function offerWith(codecs: ReturnType<typeof useOPUS>[] | ReturnType<typeof usePCMU>[]) {
  const browser = new RTCPeerConnection({ iceServers: [], codecs: { audio: codecs } });
  open.push(browser);
  browser.addTransceiver("audio", { direction: "sendrecv" });
  const offer = await browser.createOffer();
  return { type: "offer" as const, sdp: offer.sdp };
}

describe("the WebRTC answer", () => {
  it("negotiates only Opus, on the payload type the browser offered, even when PCMU comes first", async () => {
    const session = newSession();
    const answer = await session.createAnswer(await offerWith([usePCMU(), useOPUS({ payloadType: 109 })]));
    const negotiated = session.peer
      .getTransceivers()
      .find((t) => t.kind === "audio")!
      .codecs.map((codec) => codec.payloadType);
    expect(answer.sdp).not.toMatch(/PCMU/i);
    expect(negotiated).toEqual([109]);
  });

  it("rejects an offer that has no Opus instead of answering it", async () => {
    await expect(newSession().createAnswer(await offerWith([usePCMU()]))).rejects.toThrow();
  });

  it("rejects an offer that is not SDP", async () => {
    await expect(newSession().createAnswer({ type: "offer", sdp: "invalid sdp" })).rejects.toThrow();
  });
});

describe("a session whose mixer codec is unavailable", () => {
  it("closes the peer it already built before it throws", async () => {
    const closed = new Set<unknown>();
    const originalClose = RTCPeerConnection.prototype.close;
    RTCPeerConnection.prototype.close = function (this: RTCPeerConnection) {
      closed.add(this);
      return originalClose.call(this);
    };
    try {
      expect(
        () =>
          new WebRtcAudioSession({
            connectionId: "no-codec",
            logger,
            onVoiceFrame() {},
            onVoiceActivity() {},
            createEncoder: () => {
              throw new Error("native Opus missing");
            },
          }),
      ).toThrow("WebRTC Opus codec is unavailable");
      expect(closed.size).toBe(1);
    } finally {
      RTCPeerConnection.prototype.close = originalClose;
    }
  });
});

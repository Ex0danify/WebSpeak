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

const newSession = async () => {
  const session = await WebRtcAudioSession.create({ connectionId: "codecs", logger, onVoiceFrame() {}, onVoiceActivity() {} });
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
    const session = await newSession();
    const answer = await session.createAnswer(await offerWith([usePCMU(), useOPUS({ payloadType: 109 })]));
    const negotiated = session.peer
      .getTransceivers()
      .find((t) => t.kind === "audio")!
      .codecs.map((codec) => codec.payloadType);
    expect(answer.sdp).not.toMatch(/PCMU/i);
    expect(negotiated).toEqual([109]);
  });

  it("rejects an offer that has no Opus instead of answering it", async () => {
    await expect((await newSession()).createAnswer(await offerWith([usePCMU()]))).rejects.toThrow();
  });

  it("rejects an offer that is not SDP", async () => {
    await expect((await newSession()).createAnswer({ type: "offer", sdp: "invalid sdp" })).rejects.toThrow();
  });
});

describe("a session whose mixer codec is unavailable", () => {
  it("rejects before any peer is created", async () => {
    const created: unknown[] = [];
    const originalAddTransceiver = RTCPeerConnection.prototype.addTransceiver;
    RTCPeerConnection.prototype.addTransceiver = function (this: RTCPeerConnection, ...args: Parameters<typeof originalAddTransceiver>) {
      created.push(this);
      return originalAddTransceiver.apply(this, args);
    } as typeof originalAddTransceiver;
    try {
      await expect(
        WebRtcAudioSession.create({
          connectionId: "no-codec",
          logger,
          onVoiceFrame() {},
          onVoiceActivity() {},
          createEncoder: () => {
            throw new Error("native Opus missing");
          },
        }),
      ).rejects.toThrow("WebRTC Opus codec is unavailable");
      expect(created).toHaveLength(0);
    } finally {
      RTCPeerConnection.prototype.addTransceiver = originalAddTransceiver;
    }
  });
});

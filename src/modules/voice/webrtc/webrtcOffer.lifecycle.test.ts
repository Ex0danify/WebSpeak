import { afterEach, describe, expect, it, vi } from "vitest";
import { RTCPeerConnection } from "werift";
import type { Logger } from "../../../shared/logger.js";
import type { VoiceConnection } from "../voiceTypes.js";
import { WebRtcAudioSession } from "./webrtcAudioSession.js";
import { handleWebRtcOffer, handleWebRtcStop } from "./webrtcOffer.js";

const logger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return logger;
  },
};

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

async function offerSdp(): Promise<string> {
  const browser = new RTCPeerConnection({ iceServers: [] });
  browser.addTransceiver("audio", { direction: "sendrecv" });
  const offer = await browser.createOffer();
  await browser.close();
  return offer.sdp;
}

/** A connection whose TeamSpeak mute sync stays pending until the test resolves it. */
function fixture() {
  const mutes: ReturnType<typeof deferred>[] = [];
  const entry = {
    id: "lifecycle",
    webrtc: null as WebRtcAudioSession | null,
    audio: {},
    ws: { readyState: 1 },
    whisperActive: false,
    whisperTargetIds: new Set<number>(),
    tsClient: {
      setInputMuted: () => {
        const pending = deferred();
        mutes.push(pending);
        return pending.promise;
      },
      sendVoice() {},
      sendWhisper() {},
    },
  };
  const ctx = { entry, sendJson: () => undefined, logger } as unknown as VoiceConnection;
  const options = () => ({ enabled: true, udpPortRange: [41_000, 41_020] as [number, number] });
  return { entry, ctx, mutes, options };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WebRTC offer lifecycle", () => {
  it("a stop that arrives while an offer waits for the mute sync is not undone by that offer", async () => {
    const { entry, ctx, mutes, options } = fixture();
    const pending = handleWebRtcOffer(ctx, { type: "offer", sdp: await offerSdp() }, options);
    handleWebRtcStop(ctx);
    mutes[0]!.resolve();
    await pending;
    expect(entry.webrtc).toBeNull();
  });

  it("a newer offer wins and the older offer creates no peer", async () => {
    const { entry, ctx, mutes, options } = fixture();
    const sdp = await offerSdp();
    const created: WebRtcAudioSession[] = [];
    const createAnswer = WebRtcAudioSession.prototype.createAnswer;
    vi.spyOn(WebRtcAudioSession.prototype, "createAnswer").mockImplementation(function (this: WebRtcAudioSession, offer) {
      created.push(this);
      return createAnswer.call(this, offer);
    });

    const first = handleWebRtcOffer(ctx, { type: "offer", sdp }, options);
    const second = handleWebRtcOffer(ctx, { type: "offer", sdp }, options);
    mutes.forEach((mute) => mute.resolve());
    await Promise.all([first, second]);

    expect(created).toHaveLength(1);
    expect(entry.webrtc).toBe(created[0]);
    await entry.webrtc?.close();
  });
});

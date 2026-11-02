import { WebSocket } from "ws";
import type { WebRtcAudioOptions } from "../../../config/webrtcConfig.js";
import type { VoiceConnection } from "../voiceTypes.js";
import { reportSelfActivity } from "../selfActivity.js";
import { resolveWebRtcPublicAddresses } from "./webrtcPublicAddresses.js";
import { WebRtcAudioSession, type WebRtcSessionDescription } from "./webrtcAudioSession.js";

/** Counts offers and stops per connection. An offer that waits on an await checks it afterwards and gives up if it was overtaken. */
const generations = new WeakMap<object, number>();
const bumpGeneration = (entry: object): number => {
  const next = (generations.get(entry) ?? 0) + 1;
  generations.set(entry, next);
  return next;
};

/** An empty payload is how TeamSpeak learns the speaker stopped. */
function sendUplink(entry: VoiceConnection["entry"], data: Buffer, codec: 4 | 5): void {
  if (entry.whisperActive && entry.whisperTargetIds.size) entry.tsClient.sendWhisper(data, [...entry.whisperTargetIds], codec);
  else entry.tsClient.sendVoice(data, codec);
}

function forwardUplinkFrame(ctx: VoiceConnection, data: Buffer, codec: 4 | 5): void {
  const { entry } = ctx;
  const audio = entry.audio;
  const now = Date.now();
  if (audio.ingressLastAt !== null) audio.ingressMaxGapMs = Math.max(audio.ingressMaxGapMs, now - audio.ingressLastAt);
  audio.ingressFirstAt ??= now;
  audio.ingressLastAt = now;
  audio.ingressFrames++;
  try {
    sendUplink(entry, data, codec);
    const sentAt = Date.now();
    if (audio.tsSendLastAt !== null) audio.tsSendMaxGapMs = Math.max(audio.tsSendMaxGapMs, sentAt - audio.tsSendLastAt);
    audio.tsSendFirstAt ??= sentAt;
    audio.tsSendLastAt = sentAt;
    audio.tsSendFrames++;
    reportSelfActivity(ctx);
  } catch {
    audio.tsSendErrors++;
    // A packet during session replacement is dropped, the WebRTC peer can still be closed on its own.
  }
}

function endUplinkBurst(entry: VoiceConnection["entry"], codec: 4 | 5): void {
  try {
    sendUplink(entry, Buffer.alloc(0), codec);
  } catch {
    entry.audio.tsSendErrors++;
  }
}

async function closePreviousSession(entry: VoiceConnection["entry"], previous: WebRtcAudioSession): Promise<void> {
  try {
    await previous.close();
  } catch {
    /* replace a retried offer */
  }
  Object.assign(entry.audio, previous.getStats());
  entry.webrtc = null;
}

/** The offer carries the browser's initial mute state. TS clients only see it once the gateway mutes its own TS client too. */
async function syncInitialMute(ctx: VoiceConnection, muted: boolean): Promise<void> {
  try {
    await ctx.entry.tsClient.setInputMuted(muted);
  } catch (error: unknown) {
    ctx.logger.warn(
      { entryId: ctx.entry.id, muted, err: error instanceof Error ? error.message : String(error) },
      "Could not synchronize initial microphone mute state",
    );
  }
}

async function answerOffer(ctx: VoiceConnection, peer: WebRtcAudioSession, offer: WebRtcSessionDescription): Promise<void> {
  const { entry, sendJson } = ctx;
  try {
    const answer = await peer.createAnswer({ type: offer.type, sdp: offer.sdp });
    if (entry.webrtc !== peer || entry.ws.readyState !== WebSocket.OPEN) return;
    sendJson({ type: "webrtcAnswer", payload: { sdp: answer } });
    ctx.logger.info({ entryId: entry.id }, "WebRTC audio negotiation completed");
  } catch (error: unknown) {
    if (entry.webrtc === peer) entry.webrtc = null;
    try {
      await peer.close();
    } catch {
      /* best effort */
    }
    ctx.logger.warn({ entryId: entry.id, err: error instanceof Error ? error.message : String(error) }, "WebRTC audio negotiation failed");
    if (entry.ws.readyState === WebSocket.OPEN) sendJson({ type: "webrtcError", code: "WEBRTC_NEGOTIATION_FAILED" });
  }
}

export async function handleWebRtcOffer(
  ctx: VoiceConnection,
  offer: WebRtcSessionDescription,
  getWebRtcOptions: () => WebRtcAudioOptions | undefined,
): Promise<void> {
  const { entry, sendJson } = ctx;
  const generation = bumpGeneration(entry);
  const overtaken = () => generations.get(entry) !== generation;
  if (entry.webrtc) {
    await closePreviousSession(entry, entry.webrtc);
    if (overtaken()) return;
  }
  const config = getWebRtcOptions();
  if (!config?.enabled) return;
  const muted = offer.muted === true;
  await syncInitialMute(ctx, muted);
  const publicAddresses = await resolveWebRtcPublicAddresses(entry.webrtcPublicHost);
  // A stop or a newer offer may have arrived while the mute sync or the address lookup was pending. Creating the peer now would undo the stop
  // or leave the older peer open next to the newer one.
  if (overtaken()) return;
  const peer = await WebRtcAudioSession.create({
    connectionId: entry.id,
    ...(publicAddresses.length ? { publicAddresses } : {}),
    udpPortRange: config.udpPortRange,
    logger: ctx.logger,
    microphoneMuted: muted,
    accompanimentActive: offer.accompanimentActive === true,
    onVoiceFrame: (data, codec) => forwardUplinkFrame(ctx, data, codec),
    onVoiceEnd: (codec) => endUplinkBurst(entry, codec),
    onVoiceActivity: (clientIds) => {
      if (entry.ws.readyState === WebSocket.OPEN) sendJson({ type: "voiceActivity", clientIds });
    },
  });
  entry.webrtc = peer;
  await answerOffer(ctx, peer, offer);
}

export function handleWebRtcStop(ctx: VoiceConnection): void {
  bumpGeneration(ctx.entry);
  const webRtc = ctx.entry.webrtc;
  ctx.entry.webrtc = null;
  if (webRtc) {
    void webRtc
      .close()
      .then(() => Object.assign(ctx.entry.audio, webRtc.getStats()))
      .catch(() => undefined);
  }
}

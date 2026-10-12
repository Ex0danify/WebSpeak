import { WebSocket } from "ws";
import type { WebRtcAudioOptions } from "../../../config/webrtcConfig.js";
import type { VoiceConnection } from "../voiceTypes.js";
import { WebRtcAudioSession, type WebRtcSessionDescription } from "./webrtcAudioSession.js";

export async function handleWebRtcOffer(
  ctx: VoiceConnection,
  offer: WebRtcSessionDescription,
  getWebRtcOptions: () => WebRtcAudioOptions | undefined,
): Promise<void> {
  const { entry, sendJson } = ctx;
  if (entry.webrtc) {
    const previousWebRtc = entry.webrtc;
    try {
      await previousWebRtc.close();
    } catch {
      /* replace a retried offer */
    }
    Object.assign(entry.audio, previousWebRtc.getStats());
    entry.webrtc = null;
  }
  const config = getWebRtcOptions();
  if (!config?.enabled) return;
  const muted = offer.muted === true;
  try {
    // The offer carries the browser's initial mute state. TS clients only see it once the gateway
    // mutes its own TS client too.
    await entry.tsClient.setInputMuted(muted);
  } catch (error: unknown) {
    ctx.logger.warn(
      { entryId: entry.id, muted, err: error instanceof Error ? error.message : String(error) },
      "Could not synchronize initial microphone mute state",
    );
  }
  const peer = new WebRtcAudioSession({
    connectionId: entry.id,
    ...(entry.webrtcPublicHost ? { publicHost: entry.webrtcPublicHost } : {}),
    udpPortRange: config.udpPortRange,
    logger: ctx.logger,
    microphoneMuted: muted,
    accompanimentActive: offer.accompanimentActive === true,
    onVoiceFrame: (data, codec) => {
      const now = Date.now();
      if (entry.audio.ingressLastAt !== null)
        entry.audio.ingressMaxGapMs = Math.max(entry.audio.ingressMaxGapMs, now - entry.audio.ingressLastAt);
      entry.audio.ingressFirstAt ??= now;
      entry.audio.ingressLastAt = now;
      entry.audio.ingressFrames++;
      try {
        if (entry.whisperActive && entry.whisperTargetIds.size) entry.tsClient.sendWhisper(data, [...entry.whisperTargetIds], codec);
        else entry.tsClient.sendVoice(data, codec);
        const sentAt = Date.now();
        if (entry.audio.tsSendLastAt !== null)
          entry.audio.tsSendMaxGapMs = Math.max(entry.audio.tsSendMaxGapMs, sentAt - entry.audio.tsSendLastAt);
        entry.audio.tsSendFirstAt ??= sentAt;
        entry.audio.tsSendLastAt = sentAt;
        entry.audio.tsSendFrames++;
      } catch {
        entry.audio.tsSendErrors++;
        // A packet during session replacement is dropped, the WebRTC peer can still be closed on its own.
      }
    },
    onVoiceActivity: (clientIds) => {
      if (entry.ws.readyState === WebSocket.OPEN) sendJson({ type: "voiceActivity", clientIds });
    },
  });
  entry.webrtc = peer;
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

export function handleWebRtcStop(ctx: VoiceConnection): void {
  const webRtc = ctx.entry.webrtc;
  ctx.entry.webrtc = null;
  if (webRtc) {
    void webRtc
      .close()
      .then(() => Object.assign(ctx.entry.audio, webRtc.getStats()))
      .catch(() => undefined);
  }
}

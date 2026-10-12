import { WebSocket } from "ws";
import type { TSVoiceData } from "../../teamspeak/index.js";
import type { VoiceConnection } from "../voiceTypes.js";

// Keep the WebSocket egress queue small so a slow browser cannot turn old voice into seconds of latency.
// Opus frames vary in size, so this is a byte guard for roughly 10 to 20 small frames, the browser
// enforces its own time-based limit.
const MAX_SERVER_AUDIO_BUFFERED_BYTES = 4_096;

/** Hot path: runs once per 20 ms TeamSpeak voice frame per session. No allocation beyond the packet, no await. */
export function handleVoiceData(ctx: VoiceConnection, data: TSVoiceData): void {
  const receivedAt = Date.now();
  if (ctx.entry.audio.tsReceiveLastAt !== null)
    ctx.entry.audio.tsReceiveMaxGapMs = Math.max(ctx.entry.audio.tsReceiveMaxGapMs, receivedAt - ctx.entry.audio.tsReceiveLastAt);
  ctx.entry.audio.tsReceiveFirstAt ??= receivedAt;
  ctx.entry.audio.tsReceiveLastAt = receivedAt;
  ctx.entry.audio.tsReceiveFrames++;
  if (ctx.ws.readyState !== WebSocket.OPEN || data.clientId === ctx.state.selfId) return;
  const webRtc = ctx.entry.webrtc;
  webRtc?.pushTeamSpeakVoice(data);
  const now = receivedAt;
  if (ctx.entry.audio.egressLastAt !== null)
    ctx.entry.audio.egressMaxGapMs = Math.max(ctx.entry.audio.egressMaxGapMs, now - ctx.entry.audio.egressLastAt);
  ctx.entry.audio.egressFirstAt ??= now;
  ctx.entry.audio.egressLastAt = now;
  const sourceKey = String(data.clientId);
  ctx.entry.audio.egressFramesByClient[sourceKey] = (ctx.entry.audio.egressFramesByClient[sourceKey] ?? 0) + 1;
  // A negotiated WebRTC session owns realtime egress. Do not also send over the WebSocket or the
  // browser plays two copies and TCP piles up stale audio.
  if (webRtc) {
    ctx.entry.audio.egressFrames++;
    return;
  }
  const packet = Buffer.allocUnsafe(3 + data.data.length);
  packet[0] = data.codec;
  packet.writeUInt16BE(data.clientId, 1);
  data.data.copy(packet, 3);
  const bufferedBytes = ctx.ws.bufferedAmount;
  ctx.entry.audio.egressPeakBufferedBytes = Math.max(ctx.entry.audio.egressPeakBufferedBytes, bufferedBytes);
  if (bufferedBytes > MAX_SERVER_AUDIO_BUFFERED_BYTES) {
    ctx.entry.audio.egressDroppedFrames++;
    return;
  }
  try {
    ctx.ws.send(packet);
    ctx.entry.audio.egressFrames++;
    const sentAt = Date.now();
    if (ctx.entry.audio.egressSentLastAt !== null)
      ctx.entry.audio.egressSentMaxGapMs = Math.max(ctx.entry.audio.egressSentMaxGapMs, sentAt - ctx.entry.audio.egressSentLastAt);
    ctx.entry.audio.egressSentFirstAt ??= sentAt;
    ctx.entry.audio.egressSentLastAt = sentAt;
  } catch {
    ctx.entry.audio.egressDroppedFrames++;
  }
}

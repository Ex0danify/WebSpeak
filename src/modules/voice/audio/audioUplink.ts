import type { VoiceConnection } from "../voiceTypes.js";
import { sendProtocolError } from "../session/voiceFailures.js";

const AUDIO_FRAME_BYTES = 1_920;
const INVALID_FRAME_WARN_INTERVAL_MS = 5_000;

// First byte of every uplink binary frame tells the gateway how to read the rest.
const UPLINK_TAG_PCM = 0;
const UPLINK_TAG_OPUS_VOICE = 4;
// A 20 ms Opus voice frame is a few hundred bytes; reject anything that could not be a single frame.
const MAX_OPUS_FRAME_BYTES = 1_024;

/** Hot path: runs once per 20 ms browser frame per session. No allocation beyond what the encoder needs, no await. */
export function handleUplinkFrame(ctx: VoiceConnection, data: Buffer | string): void {
  const frame = typeof data === "string" ? Buffer.from(data) : data;
  if (!ctx.state.tsReady) {
    // The browser keeps sending during a reconnect, count instead of answering 50 times a second.
    ctx.entry.audio.ingressDroppedFrames++;
    return;
  }
  if (frame.length < 1) {
    reportInvalidFrame(ctx);
    return;
  }
  const tag = frame[0];
  const payload = frame.subarray(1);
  if (tag === UPLINK_TAG_PCM) {
    if (payload.length !== AUDIO_FRAME_BYTES) {
      reportInvalidFrame(ctx);
      return;
    }
    markIngress(ctx);
    sendEncodedPcm(ctx, payload);
    return;
  }
  if (tag === UPLINK_TAG_OPUS_VOICE) {
    if (payload.length === 0 || payload.length > MAX_OPUS_FRAME_BYTES) {
      reportInvalidFrame(ctx);
      return;
    }
    markIngress(ctx);
    forwardVoice(ctx, payload);
    return;
  }
  reportInvalidFrame(ctx);
}

function reportInvalidFrame(ctx: VoiceConnection): void {
  ctx.entry.audio.ingressDroppedFrames++;
  const now = Date.now();
  if (now - ctx.entry.invalidFrameWarnedAt > INVALID_FRAME_WARN_INTERVAL_MS) {
    ctx.entry.invalidFrameWarnedAt = now;
    sendProtocolError(ctx.sendJson, "INVALID_AUDIO_FRAME", "Audio frame format is invalid");
  }
}

function markIngress(ctx: VoiceConnection): void {
  const now = Date.now();
  if (ctx.entry.audio.ingressLastAt !== null)
    ctx.entry.audio.ingressMaxGapMs = Math.max(ctx.entry.audio.ingressMaxGapMs, now - ctx.entry.audio.ingressLastAt);
  ctx.entry.audio.ingressFirstAt ??= now;
  ctx.entry.audio.ingressLastAt = now;
  ctx.entry.audio.ingressFrames++;
}

function sendEncodedPcm(ctx: VoiceConnection, pcm: Buffer): void {
  const encodeStartedAt = Date.now();
  try {
    if (ctx.entry.opusEncoder) {
      const encoded = ctx.entry.opusEncoder.encode(pcm);
      ctx.entry.audio.tsEncodeMaxMs = Math.max(ctx.entry.audio.tsEncodeMaxMs, Date.now() - encodeStartedAt);
      forwardVoice(ctx, encoded);
    } else {
      // Encoder unavailable (init failed or torn down mid-flight), say so instead of dropping silently.
      if (Date.now() - ctx.entry.opusEncoderWarnedAt > 5_000) {
        ctx.entry.opusEncoderWarnedAt = Date.now();
        ctx.sendJson({ type: "audioError", code: "AUDIO_ENCODER_UNAVAILABLE", detail: "Opus encoder unavailable" });
      }
    }
  } catch {
    // A frame arriving during shutdown is safe to discard.
    ctx.entry.audio.tsSendErrors++;
  }
}

function forwardVoice(ctx: VoiceConnection, encoded: Buffer): void {
  try {
    if (ctx.entry.whisperActive && ctx.entry.whisperTargetIds.size) ctx.tsClient.sendWhisper(encoded, [...ctx.entry.whisperTargetIds], 4);
    else ctx.tsClient.sendVoice(encoded, 4);
    const sentAt = Date.now();
    if (ctx.entry.audio.tsSendLastAt !== null)
      ctx.entry.audio.tsSendMaxGapMs = Math.max(ctx.entry.audio.tsSendMaxGapMs, sentAt - ctx.entry.audio.tsSendLastAt);
    ctx.entry.audio.tsSendFirstAt ??= sentAt;
    ctx.entry.audio.tsSendLastAt = sentAt;
    ctx.entry.audio.tsSendFrames++;
  } catch {
    // A frame arriving during shutdown is safe to discard.
    ctx.entry.audio.tsSendErrors++;
  }
}

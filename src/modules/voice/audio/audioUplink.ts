import type { VoiceConnection } from "../voiceTypes.js";
import { sendProtocolError } from "../session/voiceFailures.js";

const AUDIO_FRAME_BYTES = 1_920;

/** Hot path: runs once per 20 ms browser PCM frame per session. No allocation beyond what the encoder needs, no await. */
export function handleUplinkFrame(ctx: VoiceConnection, data: Buffer | string): void {
  const frame = typeof data === "string" ? Buffer.from(data) : data;
  if (!ctx.state.tsReady || frame.length !== AUDIO_FRAME_BYTES) {
    ctx.entry.audio.ingressDroppedFrames++;
    sendProtocolError(ctx.sendJson, "INVALID_AUDIO_FRAME", "音频帧格式无效");
    return;
  }
  const now = Date.now();
  if (ctx.entry.audio.ingressLastAt !== null) ctx.entry.audio.ingressMaxGapMs = Math.max(ctx.entry.audio.ingressMaxGapMs, now - ctx.entry.audio.ingressLastAt);
  ctx.entry.audio.ingressFirstAt ??= now;
  ctx.entry.audio.ingressLastAt = now;
  ctx.entry.audio.ingressFrames++;
  const encodeStartedAt = Date.now();
  try {
    if (ctx.entry.opusEncoder) {
      const encoded = ctx.entry.opusEncoder.encode(frame);
      const encodedAt = Date.now();
      ctx.entry.audio.tsEncodeMaxMs = Math.max(ctx.entry.audio.tsEncodeMaxMs, encodedAt - encodeStartedAt);
      if (ctx.entry.whisperActive && ctx.entry.whisperTargetIds.size) ctx.tsClient.sendWhisper(encoded, [...ctx.entry.whisperTargetIds], 4);
      else ctx.tsClient.sendVoice(encoded, 4);
      const sentAt = Date.now();
      if (ctx.entry.audio.tsSendLastAt !== null) ctx.entry.audio.tsSendMaxGapMs = Math.max(ctx.entry.audio.tsSendMaxGapMs, sentAt - ctx.entry.audio.tsSendLastAt);
      ctx.entry.audio.tsSendFirstAt ??= sentAt;
      ctx.entry.audio.tsSendLastAt = sentAt;
      ctx.entry.audio.tsSendFrames++;
    } else {
      // Opus 编码器不可用（初始化失败或销毁后仍有帧在途）：显式告知浏览器
      // 而不是静默丢帧，5 秒限流避免高频告警刷屏。
      // The Opus encoder is unavailable (init failed or torn down while
      // frames are still in flight): say it instead of dropping silently.
      const warnedAt = ctx.entry.opusEncoderWarnedAt;
      if (Date.now() - warnedAt > 5_000) {
        ctx.entry.opusEncoderWarnedAt = Date.now();
        ctx.sendJson({ type: "audioError", code: "AUDIO_ENCODER_UNAVAILABLE", detail: "Opus encoder unavailable" });
      }
    }
  } catch {
    // A frame arriving during shutdown is safe to discard.
    ctx.entry.audio.tsSendErrors++;
  }
}

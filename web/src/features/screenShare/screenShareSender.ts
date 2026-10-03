import type { ScreenShareOutputSettings } from "./screenShareTypes";

/** Encoder limits and codec preference for a screen-share peer. Pure: the output settings come in as an argument. */
export async function configureScreenShareVideoSender(
  sender: RTCRtpSender, track: MediaStreamTrack, requested: ScreenShareOutputSettings | null,
): Promise<void> {
  if (!sender.setParameters || track.kind !== "video") return;
  try {
    const settings = track.getSettings();
    const sourceWidth = typeof settings.width === "number" && settings.width > 0 ? settings.width : null;
    const sourceHeight = typeof settings.height === "number" && settings.height > 0 ? settings.height : null;
    const targetWidth = requested?.maxWidth ?? sourceWidth;
    const targetHeight = requested?.maxHeight ?? sourceHeight;
    const scaleResolutionDownBy = sourceWidth && sourceHeight && targetWidth && targetHeight
      ? Math.max(1, sourceWidth / targetWidth, sourceHeight / targetHeight)
      : 1;
    const sourceFrameRate = typeof settings.frameRate === "number" && settings.frameRate > 0 ? settings.frameRate : null;
    const targetFrameRate = requested?.maxFrameRate
      ? Math.max(1, Math.min(requested.maxFrameRate, sourceFrameRate ?? requested.maxFrameRate))
      : sourceFrameRate;
    const parameters = sender.getParameters();
    const encodings = parameters.encodings?.length ? parameters.encodings : [{}];
    const firstEncoding = { ...encodings[0] };
    if (scaleResolutionDownBy > 1.01) firstEncoding.scaleResolutionDownBy = scaleResolutionDownBy;
    if (targetFrameRate) firstEncoding.maxFramerate = targetFrameRate;
    parameters.encodings = [firstEncoding, ...encodings.slice(1)];
    // Prefer keeping motion smooth and let the encoder reduce detail/resolution
    // before it throws away large numbers of frames under pressure.
    parameters.degradationPreference = "maintain-framerate";
    await sender.setParameters(parameters);
  } catch {
    // Older browsers may reject one of the optional sender parameters. The
    // track remains usable and the diagnostics panel still exposes the real
    // negotiated frame rate and dimensions.
  }
}

export function preferScreenShareCodecs(peer: RTCPeerConnection): void {
  const transceiver = peer.getTransceivers().find((candidate) => candidate.sender.track?.kind === "video" || candidate.receiver.track?.kind === "video");
  const capabilities = typeof RTCRtpReceiver !== "undefined" ? RTCRtpReceiver.getCapabilities?.("video") : null;
  if (!transceiver?.setCodecPreferences || !capabilities?.codecs?.length) return;
  const vp8 = capabilities.codecs.filter((codec) => codec.mimeType.toLowerCase() === "video/vp8");
  if (!vp8.length) return;
  const remaining = capabilities.codecs.filter((codec) => codec.mimeType.toLowerCase() !== "video/vp8");
  try { transceiver.setCodecPreferences([...vp8, ...remaining]); } catch { /* older browsers may reject codec preference changes */ }
}

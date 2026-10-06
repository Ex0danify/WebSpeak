import { isRecord } from "../directory/voiceDirectoryView.js";
import type { WebRtcSessionDescription } from "../webrtc/webrtcAudioSession.js";

export function parseWebRtcOffer(raw: string): WebRtcSessionDescription | null {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!isRecord(value) || value.type !== "webrtcOffer" || !isRecord(value.payload) || !isRecord(value.payload.sdp)) return null;
  const description = value.payload.sdp;
  if (description.type !== "offer" || typeof description.sdp !== "string" || description.sdp.length > 256 * 1024) return null;
  if (value.payload.muted !== undefined && typeof value.payload.muted !== "boolean") return null;
  if (value.payload.accompanimentActive !== undefined && typeof value.payload.accompanimentActive !== "boolean") return null;
  return {
    type: "offer",
    sdp: description.sdp,
    muted: value.payload.muted === true,
    accompanimentActive: value.payload.accompanimentActive === true,
  };
}

export function isWebRtcStopMessage(raw: string): boolean {
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) && value.type === "webrtcStop";
  } catch {
    return false;
  }
}

export function parseNumber(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

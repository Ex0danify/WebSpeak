import type { RTCPeerConnection } from "werift";
import type { WebRtcIceInfo } from "../iceInfo.js";

/** Reads the nominated pair. Whatever the pair cannot tell any more, for instance after a close, stays as it was. */
export function readIceInfo(peer: RTCPeerConnection, previous: WebRtcIceInfo | null, connectMs: number | null): WebRtcIceInfo {
  const pair = peer.iceTransports[0]?.connection.nominated;
  let localType: string | undefined;
  try {
    // The getter throws while the pair has no local candidate yet.
    localType = pair?.localCandidate.type;
  } catch {
    localType = undefined;
  }
  return {
    state: peer.connectionState,
    localType: localType ?? previous?.localType ?? null,
    remoteType: pair?.remoteCandidate.type ?? previous?.remoteType ?? null,
    protocol: pair?.remoteCandidate.transport.toLowerCase() ?? previous?.protocol ?? null,
    rttMs: pair?.rtt === undefined ? (previous?.rttMs ?? null) : Math.round(pair.rtt * 1000),
    connectMs,
  };
}

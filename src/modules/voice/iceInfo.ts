/** The path a WebRTC session settled on, as the gateway's side of the peer sees it. */
export interface WebRtcIceInfo {
  state: string;
  localType: string | null;
  remoteType: string | null;
  protocol: string | null;
  rttMs: number | null;
  connectMs: number | null;
}

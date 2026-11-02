export interface VoiceStats {
  jitterMs: number | null;
  /** Share of downlink packets lost since the last sample, null while nothing arrived. */
  lossPercent: number | null;
  /** Share of downlink samples the decoder had to invent, what the listener hears as glitches. */
  concealedPercent: number | null;
  rttMs: number | null;
  uplinkKbps: number | null;
  codec: string | null;
}

/** The voice link as the room reports it. A WebSocket downlink has no RTP stats, so loss stays null and jitter is estimated. */
export interface VoiceLinkStats extends VoiceStats {
  transport: "webrtc" | "websocket";
  /** Times playback ran dry mid-sentence since connecting, only counted on the WebSocket downlink. */
  glitches: number | null;
}

/** What the next sample is measured against, counters only grow. */
export interface VoiceStatsCounters {
  at: number;
  packetsLost: number;
  packetsReceived: number;
  concealedSamples: number;
  totalSamples: number;
  bytesSent: number;
}

type StatsRecord = { [key: string]: unknown };

function num(record: StatsRecord | undefined, key: string): number | null {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.min(100, Math.max(0, (part / whole) * 100)) : null;
}

/** Reads the voice figures out of a peer's stats. Fields a browser does not report stay null. */
export function readVoiceStats(
  report: Iterable<unknown>,
  now: number,
  previous: VoiceStatsCounters | null,
): { stats: VoiceStats; counters: VoiceStatsCounters } {
  const byId = new Map<string, StatsRecord>();
  let inbound: StatsRecord | undefined;
  let outbound: StatsRecord | undefined;
  let remoteInbound: StatsRecord | undefined;
  let pair: StatsRecord | undefined;
  for (const entry of report) {
    const record = (entry ?? {}) as StatsRecord;
    if (typeof record.id === "string") byId.set(record.id, record);
    const kind = record.kind ?? record.mediaType;
    if (record.type === "inbound-rtp" && kind === "audio") inbound = record;
    else if (record.type === "outbound-rtp" && kind === "audio") outbound = record;
    else if (record.type === "remote-inbound-rtp" && kind === "audio") remoteInbound = record;
    else if (record.type === "candidate-pair" && (record.selected === true || record.state === "succeeded")) pair = record;
  }

  const counters: VoiceStatsCounters = {
    at: now,
    packetsLost: num(inbound, "packetsLost") ?? 0,
    packetsReceived: num(inbound, "packetsReceived") ?? 0,
    concealedSamples: num(inbound, "concealedSamples") ?? 0,
    totalSamples: num(inbound, "totalSamplesReceived") ?? 0,
    bytesSent: num(outbound, "bytesSent") ?? 0,
  };

  const lost = counters.packetsLost - (previous?.packetsLost ?? 0);
  const received = counters.packetsReceived - (previous?.packetsReceived ?? 0);
  const total = counters.totalSamples - (previous?.totalSamples ?? 0);
  const concealed = counters.concealedSamples - (previous?.concealedSamples ?? 0);
  const seconds = previous ? (now - previous.at) / 1000 : 0;
  const sent = counters.bytesSent - (previous?.bytesSent ?? 0);
  const traffic = received > 0;

  const rttSeconds = num(pair, "currentRoundTripTime") ?? num(remoteInbound, "roundTripTime");
  const jitterSeconds = num(inbound, "jitter");
  const codecId = typeof inbound?.codecId === "string" ? inbound.codecId : outbound?.codecId;
  const mime = typeof codecId === "string" ? byId.get(codecId)?.mimeType : undefined;

  return {
    counters,
    stats: {
      jitterMs: traffic && jitterSeconds !== null ? jitterSeconds * 1000 : null,
      lossPercent: previous && traffic ? percent(Math.max(0, lost), Math.max(0, lost) + received) : null,
      concealedPercent: previous && total > 0 ? percent(Math.max(0, concealed), total) : null,
      rttMs: rttSeconds !== null ? rttSeconds * 1000 : null,
      uplinkKbps: previous && seconds > 0 && sent >= 0 ? (sent * 8) / 1000 / seconds : null,
      codec: typeof mime === "string" ? mime.replace(/^audio\//i, "") : null,
    },
  };
}

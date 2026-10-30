import type { PersistenceContext } from "./persistenceContext.js";

export const CONNECTION_STATUSES = ["connecting", "active", "disconnected", "failed"] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/** How the selected WebRTC path looked when the session ended, as the gateway saw it. */
export interface ConnectionIceSummary {
  state: string;
  localType: string | null;
  remoteType: string | null;
  protocol: string | null;
  rttMs: number | null;
  connectMs: number | null;
}

/** Where audio stalled or got lost between the browser, the gateway and TeamSpeak. */
export interface ConnectionAudioPath {
  transport: "webrtc" | "websocket";
  uplinkFrames: number;
  uplinkMaxGapMs: number;
  downlinkFrames: number;
  downlinkMaxGapMs: number;
  queueUnderruns: number;
  lateTicks: number;
  decodeErrors: number;
  ice: ConnectionIceSummary | null;
}

/** What a session sent and received, boiled down from the raw counters. `path` is null on a row from before it was kept. */
export interface ConnectionAudioSummary {
  talkSeconds: number;
  framesSent: number;
  framesReceived: number;
  droppedFrames: number;
  sendErrors: number;
  path: ConnectionAudioPath | null;
}

export interface ConnectionRecord {
  id: string;
  nickname: string;
  clientIp: string;
  target: string;
  relayName: string | null;
  relayTarget: string | null;
  startedAt: string;
  connectedAt: string | null;
  disconnectedAt: string | null;
  durationSeconds: number | null;
  status: ConnectionStatus;
  reason: string | null;
  failureDetail: string | null;
  audio: ConnectionAudioSummary | null;
  /** As the voice socket sent it, cut to a sane length. Null when the browser sent none. */
  userAgent: string | null;
}

export type ConnectionStart = Pick<ConnectionRecord, "id" | "nickname" | "clientIp" | "target" | "relayName" | "relayTarget" | "userAgent">;

export interface ConnectionFinish {
  reason: string | null;
  failureDetail: string | null;
  durationSeconds: number | null;
  audio: ConnectionAudioSummary | null;
}

export interface ConnectionQuery {
  limit: number;
  offset: number;
  statuses?: readonly ConnectionStatus[];
  /** Matches the nickname, the address and the target. */
  search?: string;
}

interface ConnectionRow {
  id: string;
  nickname: string;
  client_ip: string;
  target: string;
  relay_name: string | null;
  relay_target: string | null;
  started_at: string;
  connected_at: string | null;
  disconnected_at: string | null;
  duration_seconds: number | null;
  status: ConnectionStatus;
  reason: string | null;
  failure_detail: string | null;
  audio_json: string | null;
  user_agent: string | null;
}

const MAX_PAGE = 100;
const COLUMNS =
  "id, nickname, client_ip, target, relay_name, relay_target, started_at, connected_at, disconnected_at, duration_seconds, status, reason, failure_detail, audio_json, user_agent";

export class ConnectionRepository {
  constructor(private readonly context: PersistenceContext) {}

  begin(start: ConnectionStart, now: string): void {
    this.context.database
      .prepare(
        `INSERT OR REPLACE INTO connection_records (id, nickname, client_ip, target, relay_name, relay_target, started_at, status, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'connecting', ?)`,
      )
      .run(start.id, start.nickname, start.clientIp, start.target, start.relayName, start.relayTarget, now, start.userAgent);
  }

  markConnected(id: string, now: string): void {
    this.context.database.prepare("UPDATE connection_records SET status = 'active', connected_at = ? WHERE id = ?").run(now, id);
  }

  /** Closes the row: a session that never connected failed, one that did is disconnected. */
  finish(id: string, result: ConnectionFinish, now: string): ConnectionRecord | null {
    this.context.database
      .prepare(
        `UPDATE connection_records SET
           status = CASE WHEN connected_at IS NULL THEN 'failed' ELSE 'disconnected' END,
           disconnected_at = ?, duration_seconds = CASE WHEN connected_at IS NULL THEN NULL ELSE ? END,
           reason = ?, failure_detail = ?, audio_json = ?
         WHERE id = ?`,
      )
      .run(now, result.durationSeconds, result.reason, result.failureDetail, result.audio ? JSON.stringify(result.audio) : null, id);
    return this.get(id);
  }

  get(id: string): ConnectionRecord | null {
    const row = this.context.database.prepare(`SELECT ${COLUMNS} FROM connection_records WHERE id = ?`).get(id) as
      ConnectionRow | undefined;
    return row ? mapConnectionRow(row, Date.now()) : null;
  }

  /** One page of the newest sessions that match, with how many match in all. */
  list(query: ConnectionQuery): { records: ConnectionRecord[]; total: number } {
    const { where, params } = buildFilter(query);
    const limit = Math.max(1, Math.min(MAX_PAGE, Math.floor(query.limit)));
    const offset = Math.max(0, Math.floor(query.offset));
    const rows = this.context.database
      .prepare(`SELECT ${COLUMNS} FROM connection_records${where} ORDER BY started_at DESC, rowid DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as unknown as ConnectionRow[];
    const counted = this.context.database.prepare(`SELECT COUNT(*) AS total FROM connection_records${where}`).get(...params) as {
      total: number;
    };
    const now = Date.now();
    return { records: rows.map((row) => mapConnectionRow(row, now)), total: Number(counted.total) };
  }

  /** The newest `limit` sessions, for the diagnostic report. */
  recent(limit: number): ConnectionRecord[] {
    return this.list({ limit, offset: 0 }).records;
  }

  /** A restart or a crash leaves sessions open that no longer exist, they are closed as of now. */
  closeOpen(now: string): number {
    const result = this.context.database
      .prepare(
        `UPDATE connection_records SET
           status = CASE WHEN connected_at IS NULL THEN 'failed' ELSE 'disconnected' END,
           disconnected_at = ?, reason = COALESCE(reason, 'GATEWAY_RESTARTED'),
           duration_seconds = CASE WHEN connected_at IS NULL THEN NULL ELSE MAX(0, CAST(strftime('%s', ?) AS INTEGER) - CAST(strftime('%s', connected_at) AS INTEGER)) END
         WHERE status IN ('connecting', 'active')`,
      )
      .run(now, now);
    return Number(result.changes);
  }

  /** Deletes the rows older than the cutoff and all but the newest `keep`, an open session is never deleted. */
  prune(keep: number, olderThan: string): number {
    const result = this.context.database
      .prepare(
        `DELETE FROM connection_records
         WHERE status IN ('disconnected', 'failed')
           AND (started_at < ? OR rowid NOT IN (SELECT rowid FROM connection_records ORDER BY started_at DESC, rowid DESC LIMIT ?))`,
      )
      .run(olderThan, Math.max(0, Math.floor(keep)));
    return Number(result.changes);
  }
}

function buildFilter(query: ConnectionQuery): { where: string; params: string[] } {
  const clauses: string[] = [];
  const params: string[] = [];
  if (query.statuses) {
    // No status at all is an empty list, which matches nothing.
    clauses.push(`status IN (${query.statuses.map(() => "?").join(", ") || "NULL"})`);
    params.push(...query.statuses);
  }
  const term = query.search?.trim().toLowerCase();
  if (term) {
    const pattern = `%${term.replace(/[\\%_]/g, String.raw`\$&`)}%`;
    clauses.push(String.raw`(lower(nickname) LIKE ? ESCAPE '\' OR lower(client_ip) LIKE ? ESCAPE '\' OR lower(target) LIKE ? ESCAPE '\')`);
    params.push(pattern, pattern, pattern);
  }
  return { where: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "", params };
}

function mapConnectionRow(row: ConnectionRow, now: number): ConnectionRecord {
  const open = row.disconnected_at === null;
  return {
    id: row.id,
    nickname: row.nickname,
    clientIp: row.client_ip,
    target: row.target,
    relayName: row.relay_name,
    relayTarget: row.relay_target,
    startedAt: row.started_at,
    connectedAt: row.connected_at,
    disconnectedAt: row.disconnected_at,
    // A session still running has no stored duration, it is the time since it connected.
    durationSeconds:
      row.duration_seconds ?? (open && row.connected_at ? Math.max(0, Math.floor((now - Date.parse(row.connected_at)) / 1000)) : null),
    status: row.status,
    reason: row.reason,
    failureDetail: row.failure_detail,
    audio: parseAudio(row.audio_json),
    userAgent: row.user_agent,
  };
}

function parseAudio(json: string | null): ConnectionAudioSummary | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as Partial<ConnectionAudioSummary>;
    return {
      talkSeconds: Number(value.talkSeconds) || 0,
      framesSent: Number(value.framesSent) || 0,
      framesReceived: Number(value.framesReceived) || 0,
      droppedFrames: Number(value.droppedFrames) || 0,
      sendErrors: Number(value.sendErrors) || 0,
      path: parsePath(value.path),
    };
  } catch {
    return null;
  }
}

function parsePath(value: Partial<ConnectionAudioPath> | null | undefined): ConnectionAudioPath | null {
  if (!value || (value.transport !== "webrtc" && value.transport !== "websocket")) return null;
  const ice = value.ice;
  return {
    transport: value.transport,
    uplinkFrames: Number(value.uplinkFrames) || 0,
    uplinkMaxGapMs: Number(value.uplinkMaxGapMs) || 0,
    downlinkFrames: Number(value.downlinkFrames) || 0,
    downlinkMaxGapMs: Number(value.downlinkMaxGapMs) || 0,
    queueUnderruns: Number(value.queueUnderruns) || 0,
    lateTicks: Number(value.lateTicks) || 0,
    decodeErrors: Number(value.decodeErrors) || 0,
    ice: ice
      ? {
          state: String(ice.state ?? ""),
          localType: ice.localType ?? null,
          remoteType: ice.remoteType ?? null,
          protocol: ice.protocol ?? null,
          rttMs: ice.rttMs ?? null,
          connectMs: ice.connectMs ?? null,
        }
      : null,
  };
}

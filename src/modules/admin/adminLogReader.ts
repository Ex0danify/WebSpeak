import { existsSync, readFileSync } from "node:fs";

export interface AdminConnectionRecord {
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
  status: "active" | "connecting" | "disconnected" | "failed";
  reason: string | null;
  failureDetail: string | null;
}

export interface AdminLogEntry {
  timestamp: string | null;
  level: string;
  message: string;
  context: Record<string, string | number | boolean>;
}

export function readRecentLogs(logFile: string | undefined, limit: number): AdminLogEntry[] {
  if (!logFile) return [];
  try {
    const lines = readFileSync(logFile, "utf8").split(/\r?\n/).filter(Boolean).slice(-limit);
    return lines.map((line) => {
      try {
        const raw = JSON.parse(line) as Record<string, unknown>;
        const context: Record<string, string | number | boolean> = {};
        for (const key of ["component", "entryId", "code", "reason", "attempt", "target", "nickname", "clientIp", "relayName", "relayTarget", "channel", "reconnect", "port"]) {
          const value = raw[key];
          if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") context[key] = value;
        }
        return {
          timestamp: typeof raw.time === "string" ? raw.time : null,
          level: logLevelName(raw.level),
          message: typeof raw.msg === "string" ? raw.msg : "",
          context,
        };
      } catch {
        return { timestamp: null, level: "INFO", message: line.slice(0, 1000), context: {} };
      }
    });
  } catch {
    return [];
  }
}

interface StructuredLogEntry {
  timestamp: string | null;
  message: string;
  raw: Record<string, unknown>;
}

export function readConnectionHistory(logFile: string | undefined, limit: number): AdminConnectionRecord[] {
  if (!logFile) return [];
  const records = new Map<string, {
    id: string;
    nickname: string;
    clientIp: string;
    target: string;
    relayName: string;
    relayTarget: string;
    startedAt: string | null;
    connectedAt: string | null;
    disconnectedAt: string | null;
    durationSeconds: number | null;
    status: AdminConnectionRecord["status"];
    reason: string | null;
    failureDetail: string | null;
  }>();
  for (const log of readStructuredLogs(logFile)) {
    const entryId = typeof log.raw.entryId === "string" ? log.raw.entryId : "";
    if (!entryId || !log.timestamp) continue;
    const current = records.get(entryId) ?? {
      id: entryId,
      nickname: "",
      clientIp: "",
      target: "",
      relayName: "",
      relayTarget: "",
      startedAt: null,
      connectedAt: null,
      disconnectedAt: null,
      durationSeconds: null,
      status: "connecting" as const,
      reason: null,
      failureDetail: null,
    };
    const nickname = typeof log.raw.nickname === "string" ? log.raw.nickname : "";
    const clientIp = typeof log.raw.clientIp === "string" ? log.raw.clientIp : "";
    const target = typeof log.raw.target === "string" ? log.raw.target : "";
    const relayName = typeof log.raw.relayName === "string" ? log.raw.relayName : "";
    const relayTarget = typeof log.raw.relayTarget === "string" ? log.raw.relayTarget : "";
    if (nickname) current.nickname = nickname;
    if (clientIp) current.clientIp = clientIp;
    if (target) current.target = target;
    if (relayName) current.relayName = relayName;
    if (relayTarget) current.relayTarget = relayTarget;
    if (typeof log.raw.failureDetail === "string" && log.raw.failureDetail) current.failureDetail = log.raw.failureDetail;
    if (log.message === "WebClient connecting") {
      current.startedAt ??= log.timestamp;
      current.status = "connecting";
    } else if (log.message === "TS connect failed") {
      current.reason = typeof log.raw.code === "string" ? log.raw.code : current.reason;
      current.status = "failed";
    } else if (log.message === "Web client connected to TeamSpeak") {
      current.startedAt ??= log.timestamp;
      current.connectedAt = log.timestamp;
      current.status = "active";
    } else if (log.message === "Client session torn down") {
      current.startedAt ??= log.timestamp;
      current.disconnectedAt = log.timestamp;
      current.durationSeconds = current.connectedAt && typeof log.raw.durationSeconds === "number"
        ? Math.max(0, Math.floor(log.raw.durationSeconds))
        : current.connectedAt
          ? Math.max(0, Math.floor((Date.parse(log.timestamp) - Date.parse(current.connectedAt)) / 1000))
          : null;
      current.status = current.connectedAt ? "disconnected" : "failed";
      // `reason` is also used for ordinary lifecycle teardown (for example
      // websocket-close when a user clicks Leave). Only preserve an explicit
      // TeamSpeak failure code here; otherwise a normal disconnect would be
      // rendered by the admin UI as the generic request-failed message.
      current.reason = typeof log.raw.failureCode === "string" && log.raw.failureCode
        ? log.raw.failureCode
        : current.reason;
    }
    records.set(entryId, current);
  }
  const now = Date.now();
  return [...records.values()]
    .filter((record): record is typeof record & { startedAt: string } => Boolean(record.startedAt))
    .map((record) => {
      const start = record.connectedAt ?? record.startedAt;
      const end = record.disconnectedAt ? Date.parse(record.disconnectedAt) : now;
      return {
        id: record.id,
        nickname: record.nickname || "—",
        clientIp: record.clientIp || "—",
        target: record.target || "—",
        relayName: record.relayName || null,
        relayTarget: record.relayTarget || null,
        startedAt: record.startedAt,
        connectedAt: record.connectedAt,
        disconnectedAt: record.disconnectedAt,
        durationSeconds: record.durationSeconds ?? (record.status === "active" || record.status === "connecting"
          ? Math.max(0, Math.floor((end - Date.parse(start)) / 1000))
          : null),
        status: record.status,
        // Older sessions may only contain a teardown record without a
        // structured failure code. Keep normal disconnects quiet, but make
        // an untraceable failed connection explicitly visible as the generic
        // request-failed message instead of implying a guessed cause.
        reason: record.reason ?? (record.status === "failed" ? "CONNECTION_FAILED" : null),
        failureDetail: record.failureDetail,
      };
    })
    .sort((left, right) => Date.parse(right.disconnectedAt ?? right.startedAt) - Date.parse(left.disconnectedAt ?? left.startedAt))
    .slice(0, limit);
}

function readStructuredLogs(logFile: string): StructuredLogEntry[] {
  const paths = [logFile, `${logFile}.1`, `${logFile}.2`, `${logFile}.3`].filter((value, index, all) => value && all.indexOf(value) === index);
  const entries: StructuredLogEntry[] = [];
  for (const path of paths) {
    if (!existsSync(path)) continue;
    try {
      for (const line of readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean)) {
        try {
          const raw = JSON.parse(line) as Record<string, unknown>;
          entries.push({
            timestamp: typeof raw.time === "string" ? raw.time : null,
            message: typeof raw.msg === "string" ? raw.msg : "",
            raw,
          });
        } catch {
          // Non-JSON lines are still shown by the normal log viewer, but cannot
          // be associated with a user session safely.
        }
      }
    } catch {
      // A rotated file can disappear between existsSync and readFileSync.
    }
  }
  return entries.sort((left, right) => Date.parse(left.timestamp ?? "") - Date.parse(right.timestamp ?? ""));
}

function logLevelName(level: unknown): string {
  if (level === 10) return "DEBUG";
  if (level === 30) return "INFO";
  if (level === 40) return "WARN";
  if (level === 50) return "ERROR";
  if (level === 60) return "FATAL";
  return typeof level === "string" ? level.toUpperCase() : "INFO";
}

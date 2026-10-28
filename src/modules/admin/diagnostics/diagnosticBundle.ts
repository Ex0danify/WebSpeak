import { existsSync, statSync } from "node:fs";
import os from "node:os";
import { zipSync, strToU8 } from "fflate";
import { MAX_ACTIVE_SESSIONS } from "../../../shared/constants.js";
import { isProxyTrusted } from "../../../shared/http/clientIp.js";
import type { AuditEntry } from "../../../infra/persistence/auditRepository.js";
import type { ConnectionRecord, WebSpeakDatabase } from "../../../infra/persistence/database.js";
import type { AdminSessionSummary } from "../../voice/index.js";
import type { AdminOverview } from "../adminService.js";
import { coalesceSettingsChanges } from "./coalesceEvents.js";
import { readLogTail } from "./logTail.js";
import { Pseudonyms } from "./pseudonyms.js";
import { redact } from "./redactor.js";

/** Bumped whenever a file of the bundle changes its shape, so a report says which shape it has. */
export const BUNDLE_FORMAT = 1;

const PAGE = 100;
const FAILED_CONNECTION_PAGES = 3;
const RECENT_CONNECTION_PAGES = 2;
const PROBLEM_EVENT_PAGES = 3;
const RECENT_EVENT_PAGES = 2;
const SUMMARY_PROBLEMS = 10;
const INVITE_STATUSES = ["active", "expired", "exhausted", "revoked"] as const;

export interface BundleRuntime {
  host?: string;
  port?: number;
  tls: boolean;
  logDir?: string;
}

export interface BundleInput {
  database: WebSpeakDatabase;
  overview: AdminOverview;
  version: string;
  runtime: BundleRuntime;
  liveSessions: AdminSessionSummary[];
  createdSessions: number;
  /** What the download request itself shows of the browser and of a proxy in front. */
  requester?: { userAgent?: string; forwardedFor: boolean };
  now?: Date;
}

/** The files of the diagnostic bundle, redacted. Names in one file are the same labels in every other. */
export function buildBundleFiles(input: BundleInput): Record<string, string> {
  const pseudonyms = new Pseudonyms();
  const { database } = input;
  const generatedAt = (input.now ?? new Date()).toISOString();

  const connections = collectConnections(database);
  const events = collectEvents(database);
  // Registered before anything is written, so a message mentioning a guest is scrubbed wherever it comes first.
  for (const event of events) if (typeof event.details.username === "string") pseudonyms.user(event.details.username);
  for (const record of connections) {
    pseudonyms.nickname(record.nickname);
    pseudonyms.ip(record.clientIp);
    pseudonyms.target(record.target);
  }
  for (const server of database.listServers()) pseudonyms.host(server.host);
  for (const node of database.listRelayNodes()) pseudonyms.host(node.host);

  const clean = (value: unknown) => redact(pseudonyms, value);
  const json = (value: unknown) => `${JSON.stringify(clean(value), null, 2)}\n`;

  const servers = database.listServers().map((server) => ({
    serverName: server.name,
    host: server.host,
    port: server.port,
    hasPassword: Boolean(server.passwordEncrypted),
    lastTestAt: server.lastTestAt,
    lastTestLatencyMs: server.lastTestLatencyMs,
    lastTestError: server.lastTestError,
  }));

  const files: Record<string, string> = {
    "summary.json": json(summary(input, generatedAt, connections, events)),
    "environment.json": json(environment(input)),
    "config.json": json(config(database, servers.length)),
    "servers.json": json(servers),
    "sessions.json": json({ live: input.liveSessions, history: connections }),
    "events.json": json(events),
  };
  files["log-tail.ndjson"] = `${readLogTail(input.runtime.logDir, pseudonyms)}\n`;
  files["README.txt"] = readme(generatedAt, input.version, Object.keys(files));
  return files;
}

export function zipBundle(files: Record<string, string>): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])), { level: 6 });
}

/** Every failed session in the retention window up to a cap, plus the newest of the rest. */
function collectConnections(database: WebSpeakDatabase): ConnectionRecord[] {
  const byId = new Map<string, ConnectionRecord>();
  for (const [statuses, pages] of [
    [["failed"], FAILED_CONNECTION_PAGES],
    [undefined, RECENT_CONNECTION_PAGES],
  ] as const) {
    for (let page = 0; page < pages; page += 1) {
      const { records, total } = database.listConnections({ limit: PAGE, offset: page * PAGE, statuses });
      for (const record of records) byId.set(record.id, record);
      if ((page + 1) * PAGE >= total) break;
    }
  }
  return [...byId.values()].sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

/** Every warning and error up to a cap, plus the newest events of any kind for the lead-up. */
function collectEvents(database: WebSpeakDatabase): AuditEntry[] {
  const byId = new Map<number, AuditEntry>();
  for (const [severities, pages] of [
    [["warning", "error"] as const, PROBLEM_EVENT_PAGES],
    [undefined, RECENT_EVENT_PAGES],
  ] as const) {
    for (let page = 0; page < pages; page += 1) {
      const { events, total } = database.listAudit({ limit: PAGE, offset: page * PAGE, severities: severities && [...severities] });
      for (const event of events) byId.set(event.id, event);
      if ((page + 1) * PAGE >= total) break;
    }
  }
  return coalesceSettingsChanges([...byId.values()].sort((left, right) => right.id - left.id));
}

function summary(input: BundleInput, generatedAt: string, connections: ConnectionRecord[], events: AuditEntry[]) {
  const countBy = <T>(items: T[], key: (item: T) => string | null) => {
    const counts: Record<string, number> = {};
    for (const item of items) {
      const name = key(item);
      if (name) counts[name] = (counts[name] ?? 0) + 1;
    }
    return counts;
  };
  return {
    bundleFormat: BUNDLE_FORMAT,
    generatedAt,
    redaction: "pseudonymized",
    gateway: { ...input.overview.gateway, version: input.version },
    sessions: { ...input.overview.sessions, created: input.createdSessions, limit: MAX_ACTIVE_SESSIONS },
    servers: input.overview.servers.map(({ name, status, lastTestAt, latencyMs, lastError }) => ({
      name,
      status,
      lastTestAt,
      latencyMs,
      lastError,
    })),
    connections: {
      included: connections.length,
      byStatus: countBy(connections, (record) => record.status),
      byReason: countBy(connections, (record) => record.reason),
    },
    events: { included: events.length, bySeverity: countBy(events, (event) => event.severity) },
    latestProblems: events.filter((event) => event.severity !== "info").slice(0, SUMMARY_PROBLEMS),
  };
}

function environment(input: BundleInput) {
  const memory = process.memoryUsage();
  return {
    version: input.version,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    container: existsSync("/.dockerenv"),
    cpuCount: os.cpus().length,
    loadAverage: os.loadavg(),
    totalMemoryBytes: os.totalmem(),
    freeMemoryBytes: os.freemem(),
    processMemoryBytes: { rss: memory.rss, heapUsed: memory.heapUsed, heapTotal: memory.heapTotal, external: memory.external },
    processUptimeSeconds: Math.floor(process.uptime()),
    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    nodeEnv: process.env.NODE_ENV ?? null,
    listen: { host: input.runtime.host ?? null, port: input.runtime.port ?? null, tls: input.runtime.tls },
    // A proxy in front with trustProxy off shows every guest as the proxy's address.
    proxy: { trustProxy: isProxyTrusted(), forwardedForOnThisRequest: input.requester?.forwardedFor ?? false },
    screenShareIceServersSet: Boolean(process.env.WEBSPEAK_SCREEN_SHARE_ICE_SERVERS?.trim()),
    adminBrowser: input.requester?.userAgent ?? null,
    database: { schemaVersion: input.database.schemaVersion },
    logDirectoryPresent: Boolean(input.runtime.logDir && existsSync(input.runtime.logDir) && statSync(input.runtime.logDir).isDirectory()),
  };
}

function config(database: WebSpeakDatabase, serverCount: number) {
  const settings = database.getSettings();
  return {
    siteName: settings.siteName,
    accessMode: settings.accessMode,
    welcomeTextLanguages: Object.keys(settings.welcomeTexts),
    webRtc: { enabled: settings.webRtcEnabled, udpStart: settings.webRtcUdpStart, udpEnd: settings.webRtcUdpEnd },
    identityMint: {
      maxLevel: settings.identityMintMaxLevel,
      concurrency: settings.identityMintConcurrency,
      queueDepth: settings.identityMintQueueDepth,
    },
    retention: settings.retention,
    updatedAt: settings.updatedAt,
    serverCount,
    relayNodes: database.listRelayNodes().map((node) => ({
      relayName: node.name,
      enabled: node.enabled,
      host: node.host,
      port: node.port,
      hasToken: Boolean(node.tokenEncrypted),
    })),
    invites: Object.fromEntries(INVITE_STATUSES.map((status) => [status, database.countManagedInvites(status)])),
  };
}

function readme(generatedAt: string, version: string, files: string[]): string {
  return [
    `WebSpeak diagnostic bundle, format ${BUNDLE_FORMAT}`,
    `WebSpeak ${version}, created ${generatedAt}`,
    "",
    "Attach this file to the GitHub issue.",
    "",
    "Addresses, nicknames, user names, TeamSpeak client ids, server and relay names and host names are replaced by labels",
    "(ip-1/public, guest-2, host-3.org). A label is the same in every file of this bundle. Passwords, tokens and the admin",
    "account are not part of it. Free text is scrubbed of addresses, e-mail addresses and home folders, but please",
    "have a look before you post it. This is not the database backup, that file holds everything and is not for issues.",
    "",
    "Files:",
    ...files.map((name) => `  ${name}`),
    "",
  ].join("\n");
}

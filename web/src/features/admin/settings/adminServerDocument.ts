import type { AccessMode, RelayNodeForm, ServerForm } from "@/features/admin/settings/adminServerForm.js";

/** The limits the gateway enforces on the settings document, so a value outside them is held back instead of refused. */
export const SETTING_LIMITS = {
  siteNameMax: 80,
  privacyNoticeUrlMax: 300,
  port: { min: 1024, max: 65535 },
  identityMintMaxLevel: { min: 1, max: 24 },
  identityMintConcurrency: { min: 1, max: 8 },
  identityMintQueueDepth: { min: 0, max: 100 },
  eventLogRetentionDays: { min: 1, max: 365 },
  eventLogMaxRows: { min: 100, max: 50000 },
  connectionRetentionDays: { min: 1, max: 365 },
  connectionMaxRows: { min: 100, max: 100000 },
  logRetentionDays: { min: 1, max: 365 },
  relayNameMax: 80,
  relayTargetMax: 300,
  relayTokenMin: 16,
} as const;

export type SettingsSection = "access" | "web" | "webrtc" | "mint" | "retention" | "relay";

export type SettingsIssue =
  | { code: "siteName" }
  | { code: "privacyUrl" }
  | { code: "port"; min: number; max: number }
  | { code: "portOrder" }
  | { code: "number"; min: number; max: number }
  | { code: "relayName" }
  | { code: "relayTarget" }
  | { code: "relayTokenShort"; min: number }
  | { code: "relayTokenRequired" };

/** What is held back and why, by field name or `relay:<node id>:<field>`. */
export type SettingsIssues = Record<string, SettingsIssue>;

export interface RelayNodeDocument {
  id: string;
  name: string;
  target: string;
  enabled: boolean;
  tokenAction: "keep" | "replace" | "remove";
  token?: string;
}

/** The body of `PUT /api/admin/server`: always the whole settings, with every value in it one the gateway accepts. */
export interface SettingsDocument {
  accessMode: AccessMode;
  siteName: string;
  welcomeTexts: Record<string, string>;
  privacyNoticeUrl: string;
  webRtcEnabled: boolean;
  webRtcUdpStart: number;
  webRtcUdpEnd: number;
  identityMintMaxLevel: number;
  identityMintConcurrency: number;
  identityMintQueueDepth: number;
  eventLogRetentionDays: number;
  eventLogMaxRows: number;
  connectionRetentionDays: number;
  connectionMaxRows: number;
  logRetentionDays: number;
  relayNodes: RelayNodeDocument[];
}

type Limit = { min: number; max: number };
/** The settings that are one whole number within limits. */
const NUMBER_FIELDS = [
  "identityMintMaxLevel",
  "identityMintConcurrency",
  "identityMintQueueDepth",
  "eventLogRetentionDays",
  "eventLogMaxRows",
  "connectionRetentionDays",
  "connectionMaxRows",
  "logRetentionDays",
] as const;
type NumberField = (typeof NUMBER_FIELDS)[number];

/** What the gateway takes as the privacy notice: nothing, or an http(s) address without a login in it. */
function isPrivacyUrl(text: string): boolean {
  if (!text) return true;
  if (text.length > SETTING_LIMITS.privacyNoticeUrlMax) return false;
  try {
    const url = new URL(text);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

const integerIn = (value: unknown, limit: Limit): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= limit.min && value <= limit.max;

/** Host or [ipv6], then an optional port: the shapes the gateway's target parser takes. */
export function isPlausibleTarget(value: string): boolean {
  const text = value.trim();
  if (!text || text.length > SETTING_LIMITS.relayTargetMax) return false;
  const match = text.startsWith("[") ? /^\[([0-9a-f:]+)\](?::(\d+))?$/i.exec(text) : /^([a-z0-9._-]+)(?::(\d+))?$/i.exec(text);
  if (!match) return false;
  return match[2] === undefined || (Number(match[2]) >= 1 && Number(match[2]) <= 65535);
}

function nodeDocument(node: RelayNodeForm): RelayNodeDocument {
  const token = node.token.trim();
  const tokenAction =
    node.tokenAction === "replace" && token ? "replace" : node.tokenAction === "remove" && node.hasToken ? "remove" : "keep";
  return {
    id: node.id,
    name: node.name.trim(),
    target: node.target.trim(),
    enabled: node.enabled,
    tokenAction,
    ...(tokenAction === "replace" ? { token } : {}),
  };
}

function nodeIssues(node: RelayNodeForm): Record<string, SettingsIssue> {
  const found: Record<string, SettingsIssue> = {};
  const doc = nodeDocument(node);
  if (!doc.name || doc.name.length > SETTING_LIMITS.relayNameMax) found.name = { code: "relayName" };
  if (!isPlausibleTarget(doc.target)) found.target = { code: "relayTarget" };
  if (doc.tokenAction === "replace" && (doc.token?.length ?? 0) < SETTING_LIMITS.relayTokenMin) {
    found.token = { code: "relayTokenShort", min: SETTING_LIMITS.relayTokenMin };
  } else if (doc.enabled && doc.tokenAction !== "replace" && !(doc.tokenAction === "keep" && node.hasToken)) {
    found.token = { code: "relayTokenRequired" };
  }
  return found;
}

/** A node the administrator added and has not touched: nothing to save, nothing to complain about. */
function isUntouched(node: RelayNodeForm): boolean {
  return !node.name.trim() && !node.target.trim() && !node.token && !node.enabled;
}

/**
 * The settings document to save for a form, plus what had to be held back. A value that is not valid yet (a half-typed number, a relay
 * node without a target) is replaced by the one the gateway last confirmed, and an unconfirmed node is left out, so one unfinished field
 * never keeps the others from saving. `confirmed` is what the gateway answered last.
 */
export function buildSettingsDocument(form: ServerForm, confirmed: ServerForm): { document: SettingsDocument; issues: SettingsIssues } {
  const issues: SettingsIssues = {};

  const siteName = form.siteName.trim();
  const siteNameOk = siteName.length >= 1 && siteName.length <= SETTING_LIMITS.siteNameMax;
  if (!siteNameOk) issues.siteName = { code: "siteName" };

  const privacyNoticeUrl = form.privacyNoticeUrl.trim();
  const privacyUrlOk = isPrivacyUrl(privacyNoticeUrl);
  if (!privacyUrlOk) issues.privacyNoticeUrl = { code: "privacyUrl" };

  const port = SETTING_LIMITS.port;
  const startOk = integerIn(form.webRtcUdpStart, port);
  const endOk = integerIn(form.webRtcUdpEnd, port);
  if (!startOk) issues.webRtcUdpStart = { code: "port", ...port };
  if (!endOk) issues.webRtcUdpEnd = { code: "port", ...port };
  const orderOk = !startOk || !endOk || form.webRtcUdpStart <= form.webRtcUdpEnd;
  if (!orderOk) issues.webRtcUdpEnd = { code: "portOrder" };
  const rangeOk = startOk && endOk && orderOk;

  const numbers = {} as Record<NumberField, number>;
  for (const field of NUMBER_FIELDS) {
    const limit = SETTING_LIMITS[field];
    const ok = integerIn(form[field], limit);
    if (!ok) issues[field] = { code: "number", ...limit };
    numbers[field] = ok ? form[field] : confirmed[field];
  }

  const previous = new Map(confirmed.relayNodes.map((node) => [node.id, node]));
  const relayNodes: RelayNodeDocument[] = [];
  for (const node of form.relayNodes) {
    const before = previous.get(node.id);
    if (!before && isUntouched(node)) continue;
    const found = nodeIssues(node);
    if (Object.keys(found).length === 0) {
      relayNodes.push(nodeDocument(node));
      continue;
    }
    for (const [field, issue] of Object.entries(found)) issues[`relay:${node.id}:${field}`] = issue;
    if (before) relayNodes.push(nodeDocument({ ...before, token: "", tokenAction: "keep" }));
  }

  return {
    document: {
      accessMode: form.accessMode,
      siteName: siteNameOk ? siteName : confirmed.siteName,
      welcomeTexts: form.welcomeTexts,
      privacyNoticeUrl: privacyUrlOk ? privacyNoticeUrl : confirmed.privacyNoticeUrl,
      webRtcEnabled: form.webRtcEnabled,
      webRtcUdpStart: rangeOk ? form.webRtcUdpStart : confirmed.webRtcUdpStart,
      webRtcUdpEnd: rangeOk ? form.webRtcUdpEnd : confirmed.webRtcUdpEnd,
      ...numbers,
      relayNodes,
    },
    issues,
  };
}

/** A language without text and a language that is not there both fall back to the default text. */
function withoutEmptyTexts(document: SettingsDocument): SettingsDocument {
  return { ...document, welcomeTexts: Object.fromEntries(Object.entries(document.welcomeTexts).filter(([, text]) => text.trim())) };
}

/** Whether two documents say the same thing, so a save that would change nothing is not sent. */
export function sameDocument(a: SettingsDocument, b: SettingsDocument): boolean {
  return JSON.stringify(withoutEmptyTexts(a)) === JSON.stringify(withoutEmptyTexts(b));
}

/** The keys (as in `SettingsIssues`, `welcomeText` for the welcome texts) of the fields a document changes against the one before it. */
export function changedFieldKeys(next: SettingsDocument, previous: SettingsDocument): string[] {
  const keys: string[] = [];
  if (next.accessMode !== previous.accessMode) keys.push("accessMode");
  if (next.webRtcEnabled !== previous.webRtcEnabled) keys.push("webRtcEnabled");
  if (next.siteName !== previous.siteName) keys.push("siteName");
  if (next.privacyNoticeUrl !== previous.privacyNoticeUrl) keys.push("privacyNoticeUrl");
  if (JSON.stringify(withoutEmptyTexts(next).welcomeTexts) !== JSON.stringify(withoutEmptyTexts(previous).welcomeTexts))
    keys.push("welcomeText");
  for (const field of ["webRtcUdpStart", "webRtcUdpEnd", ...NUMBER_FIELDS] as const) if (next[field] !== previous[field]) keys.push(field);
  const before = new Map(previous.relayNodes.map((node) => [node.id, node]));
  for (const node of next.relayNodes) {
    const old = before.get(node.id);
    if (!old || node.name !== old.name) keys.push(`relay:${node.id}:name`);
    if (!old || node.target !== old.target) keys.push(`relay:${node.id}:target`);
    if (old && node.enabled !== old.enabled) keys.push(`relay:${node.id}:enabled`);
    if (node.tokenAction !== "keep") keys.push(`relay:${node.id}:token`);
  }
  return keys;
}

/**
 * Puts what the gateway answered to a save into the form, without taking back what the administrator typed while it was on the way. A
 * field the form still holds as it was sent takes the gateway's value (trimmed, a token turned into `hasToken`), any other field is
 * left alone: the edit that changed it has a save of its own queued.
 */
export function applySavedSettings(form: ServerForm, sent: SettingsDocument, saved: ServerForm): void {
  form.welcomeDefaults = saved.welcomeDefaults;

  if (form.accessMode === sent.accessMode) form.accessMode = saved.accessMode;
  if (form.siteName.trim() === sent.siteName) form.siteName = saved.siteName;
  if (form.privacyNoticeUrl.trim() === sent.privacyNoticeUrl) form.privacyNoticeUrl = saved.privacyNoticeUrl;
  if (JSON.stringify(form.welcomeTexts) === JSON.stringify(sent.welcomeTexts)) form.welcomeTexts = saved.welcomeTexts;
  if (form.webRtcEnabled === sent.webRtcEnabled) form.webRtcEnabled = saved.webRtcEnabled;
  // While WebRTC is on the range cannot be edited, so it only ever shows what the gateway keeps.
  if (form.webRtcEnabled || (form.webRtcUdpStart === sent.webRtcUdpStart && form.webRtcUdpEnd === sent.webRtcUdpEnd)) {
    form.webRtcUdpStart = saved.webRtcUdpStart;
    form.webRtcUdpEnd = saved.webRtcUdpEnd;
  }
  for (const field of NUMBER_FIELDS) if (form[field] === sent[field]) form[field] = saved[field];

  const sentNodes = new Map(sent.relayNodes.map((node) => [node.id, JSON.stringify(node)]));
  const savedNodes = new Map(saved.relayNodes.map((node) => [node.id, node]));
  form.relayNodes = form.relayNodes.map((node) => {
    const savedNode = savedNodes.get(node.id);
    return savedNode && sentNodes.get(node.id) === JSON.stringify(nodeDocument(node)) ? savedNode : node;
  });
}

import type { PersistedSettings, SettingsUpdate } from "../../infra/persistence/database.js";

type Scalar = string | number | boolean | null;

/** One field an edit changed. Secrets and long texts carry no values, only that they changed. */
export interface AuditChange {
  field: string;
  from?: Scalar;
  to?: Scalar;
}

/** The settings an audit entry names, flat. Works for the stored settings and for an update, where the grouped ones may be missing. */
export function settingsFields(settings: PersistedSettings | SettingsUpdate): Record<string, Scalar | undefined> {
  const { retention, linkPreview } = settings;
  return {
    siteName: settings.siteName,
    privacyNoticeUrl: settings.privacyNoticeUrl,
    accessMode: settings.accessMode,
    webRtcEnabled: settings.webRtcEnabled,
    webRtcUdpStart: settings.webRtcUdpStart,
    webRtcUdpEnd: settings.webRtcUdpEnd,
    identityMintMaxLevel: settings.identityMintMaxLevel,
    identityMintConcurrency: settings.identityMintConcurrency,
    identityMintQueueDepth: settings.identityMintQueueDepth,
    eventLogRetentionDays: retention?.eventLog.days,
    eventLogMaxRows: retention?.eventLog.maxRows,
    connectionRetentionDays: retention?.connections.days,
    connectionMaxRows: retention?.connections.maxRows,
    logRetentionDays: retention?.logs.days,
    linkPreviewImageKib: linkPreview?.imageKib,
    linkPreviewClickImageKib: linkPreview?.clickImageKib,
    linkPreviewSvgKib: linkPreview?.svgKib,
    linkPreviewCacheKib: linkPreview?.cacheKib,
  };
}

/** The fields of `after` that differ from `before`. A field missing in `after` was not part of the edit. */
export function diffFields(before: Record<string, Scalar | undefined>, after: Record<string, Scalar | undefined>): AuditChange[] {
  const changes: AuditChange[] = [];
  for (const [field, to] of Object.entries(after)) {
    if (to !== undefined && before[field] !== to) changes.push({ field, from: before[field] ?? null, to });
  }
  return changes;
}

export function sortedEntries(values: Record<string, string>): Array<[string, string]> {
  return Object.entries(values).sort(([a], [b]) => a.localeCompare(b));
}

interface RelayShape {
  id: string;
  name: string;
  enabled: boolean;
  host: string;
  port: number;
  tokenEncrypted: string | null;
}

/** Compares what an edit can touch, the timestamps of a rewritten row do not count. */
export function relayNodesChanged(before: RelayShape[], after: RelayShape[]): boolean {
  const key = (nodes: RelayShape[]) =>
    JSON.stringify(nodes.map((node) => [node.id, node.name, node.enabled, node.host, node.port, node.tokenEncrypted]));
  return key(before) !== key(after);
}

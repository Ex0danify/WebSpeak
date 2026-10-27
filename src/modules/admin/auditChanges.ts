type Scalar = string | number | boolean | null;

/** One field an edit changed. Secrets and long texts carry no values, only that they changed. */
export interface AuditChange {
  field: string;
  from?: Scalar;
  to?: Scalar;
}

/** The fields of `after` that differ from `before`. A field missing in `after` was not part of the edit. */
export function diffFields(before: Record<string, Scalar>, after: Record<string, Scalar | undefined>): AuditChange[] {
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

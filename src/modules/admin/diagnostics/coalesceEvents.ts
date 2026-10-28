import type { AuditEntry } from "../../../infra/persistence/auditRepository.js";

const BURST_MS = 60_000;

interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

/** A spinner or slider saves on every step. A run of settings changes from one address becomes one event with the net change. */
export function coalesceSettingsChanges(events: AuditEntry[]): AuditEntry[] {
  const result: AuditEntry[] = [];
  let run: AuditEntry[] = [];
  const flush = () => {
    if (run.length > 0) result.push(mergeRun(run));
    run = [];
  };
  // Newest first, so a run stays together as long as each step is close to the one before it.
  for (const event of events) {
    const last = run.at(-1);
    if (last && !(isSettingsChange(event) && sameBurst(last, event))) flush();
    if (isSettingsChange(event)) run.push(event);
    else result.push(event);
  }
  flush();
  return result;
}

function isSettingsChange(event: AuditEntry): boolean {
  return event.event === "SETTINGS_CHANGED" && Array.isArray(event.details.changes);
}

function sameBurst(newer: AuditEntry, older: AuditEntry): boolean {
  return newer.details.ip === older.details.ip && Date.parse(newer.createdAt) - Date.parse(older.createdAt) <= BURST_MS;
}

function mergeRun(run: AuditEntry[]): AuditEntry {
  const newest = run[0]!;
  if (run.length === 1) return newest;
  const fields = new Map<string, FieldChange>();
  // Oldest first: the first `from` and the last `to` of a field are the net change.
  for (const entry of [...run].reverse()) {
    for (const change of entry.details.changes as FieldChange[]) {
      const known = fields.get(change.field);
      fields.set(change.field, known ? { ...known, to: change.to } : change);
    }
  }
  const changes = [...fields.values()].filter((change) => JSON.stringify(change.from) !== JSON.stringify(change.to));
  return { ...newest, details: { ...newest.details, changes, merged: run.length } };
}

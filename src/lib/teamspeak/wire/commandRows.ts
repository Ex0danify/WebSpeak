import { TeamSpeakTransportError } from "../errors/teamSpeakErrors.js";

export type CommandRow = Readonly<Record<string, string>>;

export const DEFAULT_MAX_COMMAND_ROWS = 65_536;

/** Pipes inside values are escaped as `\p`, so a raw pipe always separates rows. Empty segments are dropped. */
export function splitCommandRows(text: string, maxRows = DEFAULT_MAX_COMMAND_ROWS): string[] {
  const rows: string[] = [];
  for (const segment of text.split("|")) {
    if (!segment.trim()) continue;
    if (rows.length === maxRows) {
      throw new TeamSpeakTransportError("malformedData", `TeamSpeak command has more than ${maxRows} rows`);
    }
    rows.push(segment);
  }
  if (rows.length === 0) rows.push("");
  return rows;
}

/**
 * Fields that the first row carries and a later row lacks belong to every row: a batched
 * notifycliententerview sends `cfid ctid reasonid` once, notifyeffectivepermissions does the same
 * with `cldbid cid return_code`. Later rows never inherit from each other.
 */
export function shareFirstRowFields(rows: readonly CommandRow[]): CommandRow[] {
  const [first, ...rest] = rows;
  if (!first) return [];
  return [first, ...rest.map((row) => Object.assign(Object.create(null) as Record<string, string>, first, row))];
}

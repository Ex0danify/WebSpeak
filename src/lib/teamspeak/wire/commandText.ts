import { TeamSpeakTransportError } from "../errors/teamSpeakErrors.js";
import { escapeCommandValue, unescapeCommandValue } from "./commandEscape.js";
import { type CommandRow, DEFAULT_MAX_COMMAND_ROWS, shareFirstRowFields, splitCommandRows } from "./commandRows.js";

/** `null` sends the key without a value, `undefined` leaves it out. */
export type CommandValue = string | number | bigint | boolean | null | undefined;
export type CommandParams = Readonly<Record<string, CommandValue>> | ReadonlyArray<readonly [string, CommandValue]>;

export interface BuildCommandOptions {
  /** Further rows after the first, which holds `params`. */
  rows?: readonly CommandParams[];
  /** Written as `-name` at the end. */
  flags?: readonly string[];
}

export interface ParsedCommand {
  /** Undefined for answer rows, which start with a key. */
  name: string | undefined;
  flags: readonly string[];
  rows: readonly CommandRow[];
}

export interface ParseCommandOptions {
  /** Answer rows have no name. Without this a leading bare key is taken for the name. */
  nameless?: boolean;
  maxRows?: number;
}

const NAME = /^[A-Za-z0-9_]+$/;

function checkName(kind: string, name: string): string {
  if (!NAME.test(name)) throw new TypeError(`Invalid TeamSpeak command ${kind}: ${JSON.stringify(name)}`);
  return name;
}

function formatValue(key: string, value: CommandValue): string {
  if (typeof value === "string") return escapeCommandValue(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number" && !Number.isFinite(value)) throw new TypeError(`TeamSpeak command value ${key} is not finite`);
  return String(value);
}

function formatParams(params: CommandParams): string[] {
  const entries = Array.isArray(params) ? (params as ReadonlyArray<readonly [string, CommandValue]>) : Object.entries(params);
  const tokens: string[] = [];
  for (const [key, value] of entries) {
    if (value === undefined) continue;
    checkName("key", key);
    tokens.push(value === null ? key : `${key}=${formatValue(key, value)}`);
  }
  return tokens;
}

export function buildCommand(name: string, params: CommandParams = {}, options: BuildCommandOptions = {}): string {
  const rows = [
    [checkName("name", name), ...formatParams(params)].join(" "),
    ...(options.rows ?? []).map((row) => formatParams(row).join(" ")),
  ];
  const flags = (options.flags ?? []).map((flag) => `-${checkName("flag", flag.replace(/^-/, ""))}`);
  return [rows.join("|"), ...flags].join(" ");
}

function malformed(message: string): TeamSpeakTransportError {
  return new TeamSpeakTransportError("malformedData", message);
}

export function parseCommand(text: string, options: ParseCommandOptions = {}): ParsedCommand {
  const segments = splitCommandRows(text, options.maxRows ?? DEFAULT_MAX_COMMAND_ROWS);
  const flags: string[] = [];
  const rows: Record<string, string>[] = [];
  let name: string | undefined;

  segments.forEach((segment, index) => {
    const tokens = segment.split(" ").filter(Boolean);
    if (index === 0 && !options.nameless && tokens[0] && !tokens[0].includes("=") && !tokens[0].startsWith("-")) {
      name = tokens.shift();
    }
    const row = Object.create(null) as Record<string, string>;
    for (const token of tokens) {
      const equals = token.indexOf("=");
      if (equals === 0) throw malformed("TeamSpeak command has a value without a key");
      if (equals < 0 && token.startsWith("-") && token.length > 1) flags.push(token.slice(1));
      else if (equals < 0) row[token] = "";
      else row[token.slice(0, equals)] = unescapeCommandValue(token.slice(equals + 1));
    }
    rows.push(row);
  });

  if (name === undefined && Object.keys(rows[0]).length === 0 && rows.length === 1 && flags.length === 0) {
    throw malformed("TeamSpeak command is empty");
  }
  return { name, flags, rows: shareFirstRowFields(rows) };
}

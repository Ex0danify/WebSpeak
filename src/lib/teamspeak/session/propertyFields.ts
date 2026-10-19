import type { CommandRow } from "../wire/commandRows.js";
import { parseBool, parseList, parseU16, parseU32 } from "../wire/commandValues.js";

type Parser<T> = (text: string) => T | undefined;

/** Server key, parser and the value a record starts with. */
export type FieldSpec<T> = { readonly [K in keyof T]: readonly [key: string, parse: Parser<T[K]>, initial: T[K]] };

export type Properties = Readonly<Record<string, string>>;

export const text: Parser<string> = (value) => value;
export const flag: Parser<boolean> = parseBool;
export const groupIds: Parser<readonly number[]> = (value) => parseList(value, parseU32);

export interface Invoker {
  /** 0 for the server itself. */
  id: number;
  name: string;
  uid: string;
}

export function invokerOf(row: CommandRow): Invoker | undefined {
  const id = parseU16(row.invokerid);
  if (id === undefined) return undefined;
  return { id, name: row.invokername ?? "", uid: row.invokeruid ?? "" };
}

const same = (a: unknown, b: unknown) =>
  Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((item, i) => item === b[i]) : a === b;

/**
 * Reads the fields a row carries on top of `previous`. A value that does not parse keeps the
 * previous one, the raw text still lands in `properties`.
 */
export function readFields<T extends object>(
  spec: FieldSpec<T>,
  row: CommandRow,
  previous: (T & { properties: Properties }) | undefined,
  skip: ReadonlySet<string> = new Set(),
): { fields: T; properties: Properties; changed: (keyof T)[] } {
  const fields = {} as T;
  const changed: (keyof T)[] = [];
  for (const name of Object.keys(spec) as (keyof T)[]) {
    const [key, parse, initial] = spec[name];
    const before = previous ? previous[name] : initial;
    const raw = row[key];
    const value = raw === undefined ? undefined : parse(raw);
    fields[name] = value === undefined ? before : value;
    if (previous && !same(before, fields[name])) changed.push(name);
  }
  const properties = Object.assign(Object.create(null) as Record<string, string>, previous?.properties);
  for (const [key, value] of Object.entries(row)) if (!skip.has(key)) properties[key] = value;
  return { fields, properties, changed };
}

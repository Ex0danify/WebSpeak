// Strict value parsers. Anything that is not a canonical value returns undefined instead of a guessed 0.

const MAX_DIGITS = 32;
const UNSIGNED = /^\d+$/;
const SIGNED = /^-?\d+$/;
const U64_MAX = 0xffff_ffff_ffff_ffffn;

function parseInteger(text: string | undefined, pattern: RegExp, min: number, max: number): number | undefined {
  if (text === undefined || text.length > MAX_DIGITS || !pattern.test(text)) return undefined;
  const value = Number(text);
  // Adding 0 turns "-0" into 0.
  return value >= min && value <= max ? value + 0 : undefined;
}

export const parseU8 = (text: string | undefined) => parseInteger(text, UNSIGNED, 0, 0xff);
export const parseU16 = (text: string | undefined) => parseInteger(text, UNSIGNED, 0, 0xffff);
export const parseU32 = (text: string | undefined) => parseInteger(text, UNSIGNED, 0, 0xffff_ffff);
export const parseI32 = (text: string | undefined) => parseInteger(text, SIGNED, -0x8000_0000, 0x7fff_ffff);

export function parseU64(text: string | undefined): bigint | undefined {
  if (text === undefined || text.length > MAX_DIGITS || !UNSIGNED.test(text)) return undefined;
  const value = BigInt(text);
  return value <= U64_MAX ? value : undefined;
}

export function parseBool(text: string | undefined): boolean | undefined {
  if (text === "1") return true;
  if (text === "0") return false;
  return undefined;
}

/** Comma separated list, `""` is the empty list. One bad item makes the whole list undefined. */
export function parseList<T>(text: string | undefined, parseItem: (item: string) => T | undefined): T[] | undefined {
  if (text === undefined) return undefined;
  if (text === "") return [];
  const items: T[] = [];
  for (const item of text.split(",")) {
    const value = parseItem(item);
    if (value === undefined) return undefined;
    items.push(value);
  }
  return items;
}

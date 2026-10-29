import { AdminInputError } from "./adminService.js";

export const PAGE_MAX = 100;
export const SEARCH_MAX = 100;

/** Readers for the query string of a paged admin list, every one throws the error its list asks for. */
export function createQueryReaders(code: string, message: string) {
  const invalid = () => new AdminInputError(code, message);

  function single(value: unknown): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "string") throw invalid();
    return value;
  }

  return {
    single,
    integer(value: unknown, fallback: number, min: number, max: number): number {
      const text = single(value);
      if (text === undefined) return fallback;
      const number = Number(text);
      if (!text.trim() || !Number.isInteger(number) || number < min || number > max) throw invalid();
      return number;
    },
    list<T extends string>(value: unknown, allowed: readonly T[]): T[] | undefined {
      const text = single(value);
      if (text === undefined) return undefined;
      const items = (text ? text.split(",") : []).map((name) => allowed.find((candidate) => candidate === name));
      if (items.some((item) => !item)) throw invalid();
      return items as T[];
    },
    search(value: unknown): string | undefined {
      const text = single(value);
      if (text !== undefined && text.length > SEARCH_MAX) throw invalid();
      return text;
    },
    since(value: unknown): string | undefined {
      const text = single(value);
      if (text === undefined) return undefined;
      const time = Date.parse(text);
      if (Number.isNaN(time)) throw invalid();
      return new Date(time).toISOString();
    },
  };
}

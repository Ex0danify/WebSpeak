import { AUDIT_CATEGORIES, AUDIT_SEVERITIES } from "../../infra/persistence/auditEvents.js";
import type { AuditQuery } from "../../infra/persistence/auditRepository.js";
import { AdminInputError } from "./adminService.js";

const PAGE_DEFAULT = 25;
const PAGE_MAX = 100;
const SEARCH_MAX = 100;

function invalid(): AdminInputError {
  return new AdminInputError("INVALID_AUDIT_QUERY", "Event log query is invalid");
}

function single(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw invalid();
  return value;
}

function readInteger(value: unknown, fallback: number, min: number, max: number): number {
  const text = single(value);
  if (text === undefined) return fallback;
  const number = Number(text);
  if (!text.trim() || !Number.isInteger(number) || number < min || number > max) throw invalid();
  return number;
}

function readList<T extends string>(value: unknown, allowed: readonly T[]): T[] | undefined {
  const text = single(value);
  if (text === undefined) return undefined;
  const items = (text ? text.split(",") : []).map((name) => allowed.find((candidate) => candidate === name));
  if (items.some((item) => !item)) throw invalid();
  return items as T[];
}

function readSince(value: unknown): string | undefined {
  const text = single(value);
  if (text === undefined) return undefined;
  const time = Date.parse(text);
  if (Number.isNaN(time)) throw invalid();
  return new Date(time).toISOString();
}

/** Paging and filters of GET /audit. Without `categories` or `severities` everything matches, an empty list matches none. */
export function readAuditQuery(query: Record<string, unknown>): AuditQuery {
  const search = single(query.q);
  if (search !== undefined && search.length > SEARCH_MAX) throw invalid();
  return {
    limit: readInteger(query.limit, PAGE_DEFAULT, 1, PAGE_MAX),
    offset: readInteger(query.offset, 0, 0, Number.MAX_SAFE_INTEGER),
    categories: readList(query.categories, AUDIT_CATEGORIES),
    severities: readList(query.severities, AUDIT_SEVERITIES),
    search,
    since: readSince(query.since),
  };
}

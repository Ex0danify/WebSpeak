import { AUDIT_CATEGORIES, AUDIT_SEVERITIES } from "../../infra/persistence/auditEvents.js";
import type { AuditQuery } from "../../infra/persistence/auditRepository.js";
import { createQueryReaders, PAGE_MAX } from "./adminQueryParams.js";

const PAGE_DEFAULT = 25;
const read = createQueryReaders("INVALID_AUDIT_QUERY", "Event log query is invalid");

/** Paging and filters of GET /audit. Without `categories` or `severities` everything matches, an empty list matches none. */
export function readAuditQuery(query: Record<string, unknown>): AuditQuery {
  return {
    limit: read.integer(query.limit, PAGE_DEFAULT, 1, PAGE_MAX),
    offset: read.integer(query.offset, 0, 0, Number.MAX_SAFE_INTEGER),
    categories: read.list(query.categories, AUDIT_CATEGORIES),
    severities: read.list(query.severities, AUDIT_SEVERITIES),
    search: read.search(query.q),
    since: read.since(query.since),
  };
}

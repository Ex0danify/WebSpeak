import { CONNECTION_STATUSES, type ConnectionQuery } from "../../infra/persistence/connectionRepository.js";
import { createQueryReaders, PAGE_MAX } from "./adminQueryParams.js";

const PAGE_DEFAULT = 25;
const read = createQueryReaders("INVALID_CONNECTION_QUERY", "Connection history query is invalid");

/** Paging and filters of GET /connections. Without `statuses` everything matches, an empty list matches none. */
export function readConnectionQuery(query: Record<string, unknown>): ConnectionQuery {
  return {
    limit: read.integer(query.limit, PAGE_DEFAULT, 1, PAGE_MAX),
    offset: read.integer(query.offset, 0, 0, Number.MAX_SAFE_INTEGER),
    statuses: read.list(query.statuses, CONNECTION_STATUSES),
    search: read.search(query.q),
  };
}

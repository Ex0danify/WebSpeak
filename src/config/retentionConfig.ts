/** How long and how much of the event log and the connection records the gateway keeps, admin-configurable and persisted. */
export interface RetentionLimit {
  days: number;
  maxRows: number;
}

export interface RetentionPolicy {
  eventLog: RetentionLimit;
  connections: RetentionLimit;
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  eventLog: { days: 90, maxRows: 5000 },
  connections: { days: 30, maxRows: 10_000 },
};

// The ceilings fit a community or clan of a few hundred regulars, a bigger gateway wants an external log pipeline.
export const RETENTION_DAYS_MIN = 1;
export const RETENTION_DAYS_MAX = 365;
export const EVENT_LOG_ROWS_MIN = 100;
export const EVENT_LOG_ROWS_MAX = 50_000;
export const CONNECTION_ROWS_MIN = 100;
export const CONNECTION_ROWS_MAX = 100_000;

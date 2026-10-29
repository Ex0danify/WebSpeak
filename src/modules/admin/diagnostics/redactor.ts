import type { Pseudonyms } from "./pseudonyms.js";

const MAX_DEPTH = 8;
const REMOVED = "[removed]";
// A boolean such as hasPassword stays, only a text under such a key is dropped.
const SECRET_KEY = /pass(word)?$|secret|token|cookie|csrf|salt|hash|identity|authorization|credential/i;

// Codes and identifiers the log and the event list are searched by. A known name inside them would only break the search.
const CODE_KEYS = new Set([
  "event",
  "component",
  "reason",
  "failureCode",
  "normalizedCode",
  "code",
  "state",
  "step",
  "category",
  "severity",
  "status",
  "endedBy",
  "cachedProtocol",
  "syscall",
  "type",
]);

type Rule = (pseudonyms: Pseudonyms, value: string) => string;

const RULES: Record<string, Rule> = {
  ip: (p, value) => p.ip(value),
  clientIp: (p, value) => p.ip(value),
  address: (p, value) => p.ip(value),
  host: (p, value) => p.host(value),
  hostname: (p, value) => p.host(value),
  targetHost: (p, value) => p.host(value),
  target: (p, value) => p.target(value),
  relayTarget: (p, value) => p.target(value),
  nickname: (p, value) => p.nickname(value),
  username: (p, value) => p.user(value),
  name: (p, value) => p.server(value),
  serverName: (p, value) => p.server(value),
  relayName: (p, value) => p.relay(value),
  uid: (p, value) => p.uid(value),
  channel: (p, value) => (value ? p.channel(value) : value),
  siteName: () => "[site name]",
};

/** Walks a value the way a log line or an event is built and strips what identifies someone, by key first and by content second. */
export function redact(pseudonyms: Pseudonyms, value: unknown, key = "", depth = 0): unknown {
  if (typeof value === "string") return redactText(pseudonyms, key, value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[too deep]";
  if (Array.isArray(value)) return value.map((item) => redact(pseudonyms, item, key, depth + 1));
  // The names a line carries are registered first, so a message of the same line is scrubbed of them too.
  const entries = Object.entries(value).sort(([left], [right]) => Number(right in RULES) - Number(left in RULES));
  const redacted = new Map(entries.map(([name, child]) => [name, redact(pseudonyms, child, name, depth + 1)]));
  return Object.fromEntries(Object.keys(value).map((name) => [name, redacted.get(name)]));
}

function redactText(pseudonyms: Pseudonyms, key: string, value: string): string {
  if (SECRET_KEY.test(key)) return REMOVED;
  if (CODE_KEYS.has(key)) return pseudonyms.scrubPatterns(value);
  const rule = RULES[key];
  return rule ? rule(pseudonyms, value) : pseudonyms.scrub(value);
}

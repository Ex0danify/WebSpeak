import { isIP } from "node:net";

type PseudonymKind = "user" | "nickname" | "host" | "server" | "relay" | "channel" | "email" | "uid";

const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const IPV6 = /(?<![\w:])(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?![\w:])/gi;
// The lookbehind makes a match start at the beginning of the local part, so a long run without an @ is not rescanned from every position.
const EMAIL = /(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const HOME_PATH = /(\/home\/|\/Users\/|[A-Za-z]:\\Users\\)[^/\\\s"']+/g;
// A shorter value would hit ordinary words in a message.
const MIN_SCRUBBED_LENGTH = 3;
// A name only counts as one when it stands alone, so "admin" leaves ADMIN_LOGIN_FAILED and "administrator" alone.
const NAME_CHAR = String.raw`[\p{L}\p{N}_-]`;
const LEGACY_IPV4 = /^\d{1,10}(?:\.\d{1,3}){0,3}$/;

/**
 * Replaces what identifies a person or a machine with a label that stays the same within one bundle, so
 * "the same guest failed three times" is still readable. IPs keep their class, a private address and a public
 * one point to different problems.
 */
export class Pseudonyms {
  private readonly maps = new Map<PseudonymKind | "ip", Map<string, string>>();

  ip(value: string): string {
    const address = normalizeIp(value);
    if (address === "0.0.0.0" || address === "::") return address;
    return this.label("ip", address.toLowerCase(), (count) => `ip-${count}/${ipClass(address)}`);
  }

  nickname(value: string): string {
    return this.label("nickname", value, (count) => `guest-${count}`);
  }

  user(value: string): string {
    return this.label("user", value, (count) => `user-${count}`);
  }

  server(value: string): string {
    return this.label("server", value, (count) => `server-${count}`);
  }

  relay(value: string): string {
    return this.label("relay", value, (count) => `relay-${count}`);
  }

  channel(value: string): string {
    return this.label("channel", value, (count) => `channel-${count}`);
  }

  /** The unique id of a TeamSpeak client, a stable identifier of whoever owns the identity. */
  uid(value: string): string {
    return this.label("uid", value, (count) => `uid-${count}`);
  }

  /** A domain keeps its last label, a DNS or TLS problem often depends on it. */
  host(value: string): string {
    const host = value.trim().replace(/^\[|\]$/g, "");
    if (isIP(host) || isIP(normalizeIp(host))) return this.ip(host);
    const legacy = expandLegacyIpv4(host);
    if (legacy) return this.ip(legacy);
    if (host.toLowerCase() === "localhost") return host;
    const suffix = host.includes(".") ? `.${host.slice(host.lastIndexOf(".") + 1)}` : "";
    return this.label("host", host.toLowerCase(), (count) => `host-${count}${suffix}`);
  }

  /** `host:port` and `[v6]:port` keep the port. */
  target(value: string): string {
    const match = /^(\[[^\]]+\]|[^:]+):(\d{1,5})$/.exec(value.trim());
    if (match) return `${this.host(match[1]!)}:${match[2]}`;
    return this.host(value);
  }

  /** Free text: addresses, e-mail addresses, home folders and every name seen so far. */
  scrub(text: string): string {
    return this.scrubPatterns(this.scrubKnown(text));
  }

  /** For codes and identifiers: only what looks like an address, a mail or a home folder, never a known name. */
  scrubPatterns(text: string): string {
    let result = text.replace(HOME_PATH, "$1<user>");
    result = result.replace(EMAIL, (found) => this.label("email", found.toLowerCase(), (count) => `email-${count}`));
    result = result.replace(IPV4, (found) => (isIP(found) ? this.ip(found) : found));
    return result.replace(IPV6, (found) => (isIP(found) ? this.ip(found) : found));
  }

  private scrubKnown(text: string): string {
    const known: Array<[string, string]> = [];
    for (const kind of ["nickname", "user", "host", "uid"] as const) {
      for (const [value, label] of this.maps.get(kind) ?? []) if (value.length >= MIN_SCRUBBED_LENGTH) known.push([value, label]);
    }
    if (known.length === 0) return text;
    known.sort(([left], [right]) => right.length - left.length);
    const names = known.map(([value]) => escapeRegex(value)).join("|");
    const pattern = new RegExp(`(?<!${NAME_CHAR})(?:${names})(?!${NAME_CHAR})`, "giu");
    const labels = new Map(known.map(([value, label]) => [value.toLowerCase(), label]));
    return text.replace(pattern, (found) => labels.get(found.toLowerCase()) ?? found);
  }

  private label(kind: PseudonymKind | "ip", key: string, make: (count: number) => string): string {
    let map = this.maps.get(kind);
    if (!map) {
      map = new Map();
      this.maps.set(kind, map);
    }
    let label = map.get(key);
    if (!label) {
      label = make(map.size + 1);
      map.set(key, label);
    }
    return label;
  }
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/** `127.1` or `2130706433` are addresses to a resolver, `isIP` does not know them. */
function expandLegacyIpv4(host: string): string | undefined {
  if (!LEGACY_IPV4.test(host)) return undefined;
  const parts = host.split(".").map(Number);
  const last = parts.pop()!;
  if (parts.some((part) => part > 255) || last >= 256 ** (4 - parts.length)) return undefined;
  const bytes = [...parts];
  for (let power = 3 - parts.length; power >= 0; power -= 1) bytes.push(Math.floor(last / 256 ** power) % 256);
  return bytes.join(".");
}

/** `::ffff:10.0.0.1` is the address a dual-stack socket reports for an IPv4 client. */
function normalizeIp(value: string): string {
  const address = value.trim().replace(/^\[|\]$/g, "");
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  return mapped ? mapped[1]! : address;
}

function isPrivateIpv4(first: number, second: number): boolean {
  if (first === 10) return true;
  if (first === 172) return second >= 16 && second <= 31;
  if (first === 192) return second === 168;
  if (first === 169) return second === 254;
  if (first === 100) return second >= 64 && second <= 127;
  return false;
}

function ipClass(address: string): "loopback" | "private" | "public" | "unknown" {
  const family = isIP(address);
  if (family === 4) {
    const [first = 0, second = 0] = address.split(".").map(Number);
    if (first === 127) return "loopback";
    return isPrivateIpv4(first, second) ? "private" : "public";
  }
  if (family === 6) {
    const lower = address.toLowerCase();
    if (lower === "::1") return "loopback";
    if (/^f[cd]/.test(lower) || /^fe[89ab]/.test(lower)) return "private";
    return "public";
  }
  return "unknown";
}

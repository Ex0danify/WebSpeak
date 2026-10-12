import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";

/** Forwarded headers are only believed when the operator says a reverse proxy sits in front. */
export function isProxyTrusted(env: NodeJS.ProcessEnv = process.env): boolean {
  return /^(1|true|yes|on)$/i.test(env.WEBSPEAK_TRUST_PROXY?.trim() ?? "");
}

/**
 * The address of the peer. With a trusted proxy that is the last `X-Forwarded-For` entry (the one the proxy
 * appended, earlier entries are client supplied); without one only the socket address counts.
 */
export function resolveClientIp(request: IncomingMessage, trustProxy = isProxyTrusted()): string {
  if (trustProxy) {
    const forwarded = lastForwardedFor(request);
    if (forwarded) return forwarded;
  }
  return normalizeClientIp(request.socket.remoteAddress) ?? "unknown";
}

/** Rate limiter key: IPv6 clients get a whole /64 each, so one host cannot rotate through addresses. */
export function clientRateLimitKey(request: IncomingMessage, trustProxy = isProxyTrusted()): string {
  const ip = resolveClientIp(request, trustProxy);
  return isIP(ip) === 6 ? ipv6Prefix64(ip) : ip;
}

/** Whether the browser reached us over HTTPS, either directly or through a trusted TLS-terminating proxy. */
export function isHttpsRequest(request: IncomingMessage, trustProxy = isProxyTrusted()): boolean {
  if ((request.socket as { encrypted?: boolean }).encrypted === true) return true;
  if (!trustProxy) return false;
  const proto = lastValue(request.headers["x-forwarded-proto"]);
  return proto?.toLowerCase() === "https";
}

function lastForwardedFor(request: IncomingMessage): string | undefined {
  return normalizeClientIp(lastValue(request.headers["x-forwarded-for"]));
}

function lastValue(header: string | string[] | undefined): string | undefined {
  const joined = Array.isArray(header) ? header.join(",") : header;
  return joined?.split(",").at(-1)?.trim() || undefined;
}

function normalizeClientIp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) trimmed = trimmed.slice(1, -1);
  if (trimmed.toLowerCase().startsWith("::ffff:")) {
    const mapped = trimmed.slice("::ffff:".length);
    if (isIP(mapped) === 4) trimmed = mapped;
  }
  return isIP(trimmed) ? trimmed : undefined;
}

function ipv6Prefix64(ip: string): string {
  const [address = ip] = ip.split("%");
  const [head = "", tail] = address.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];
  const groups =
    tail === undefined ? headGroups : [...headGroups, ...Array<string>(8 - headGroups.length - tailGroups.length).fill("0"), ...tailGroups];
  return `${groups
    .slice(0, 4)
    .map((g) => g.toLowerCase().replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

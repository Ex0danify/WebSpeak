import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";

export function resolveWebRtcPublicHost(request: IncomingMessage): string | undefined {
  const origin = firstHeader(request.headers.origin);
  const forwardedHost = firstHeader(request.headers["x-forwarded-host"]);
  const directHost = firstHeader(request.headers.host);
  for (const candidate of [origin, forwardedHost, directHost]) {
    const host = normalizeWebRtcHost(candidate);
    if (host) return host;
  }
  return undefined;
}

export function resolveClientIp(request: IncomingMessage): string {
  const candidates = [
    firstHeader(request.headers["x-forwarded-for"])?.split(",", 1)[0],
    firstHeader(request.headers["x-real-ip"]),
    request.socket.remoteAddress,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeClientIp(candidate);
    if (normalized) return normalized;
  }
  return "unknown";
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

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeWebRtcHost(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.split(",", 1)[0]?.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return undefined;
  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return parsed.hostname || undefined;
  } catch {
    return undefined;
  }
}

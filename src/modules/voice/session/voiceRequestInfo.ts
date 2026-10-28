import type { IncomingMessage } from "node:http";

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

const MAX_USER_AGENT_LENGTH = 512;

/** What the browser called itself on the voice socket, free of control characters and cut to a sane length. */
export function readUserAgent(request: IncomingMessage): string | undefined {
  const value = firstHeader(request.headers["user-agent"]);
  const clean = value?.replace(/\p{Cc}/gu, " ").trim().slice(0, MAX_USER_AGENT_LENGTH);
  return clean || undefined;
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

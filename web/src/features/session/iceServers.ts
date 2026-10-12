export const SCREEN_SHARE_NEGOTIATION_TIMEOUT_MS = 15_000;
const DEFAULT_SCREEN_SHARE_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:turn.teamspeak.com:3478" },
  { urls: "stun:turn2.teamspeak.com:3478" },
];
// Shared by every voice instance in the page.
let screenShareIceServers: RTCIceServer[] = DEFAULT_SCREEN_SHARE_ICE_SERVERS;

export function getScreenShareIceServers(): RTCIceServer[] {
  return screenShareIceServers;
}

export function setScreenShareIceServers(raw: unknown): void {
  screenShareIceServers = normalizeScreenShareIceServers(raw);
}

export function normalizeScreenShareIceServers(raw: unknown): RTCIceServer[] {
  if (!Array.isArray(raw)) return DEFAULT_SCREEN_SHARE_ICE_SERVERS;
  const normalized: RTCIceServer[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const value = item as Record<string, unknown>;
    const rawUrls = value.urls;
    const urls = (Array.isArray(rawUrls) ? rawUrls : [rawUrls])
      .filter((url): url is string => typeof url === "string" && /^(?:stun|stuns|turn|turns):/i.test(url.trim()))
      .map((url) => url.trim())
      .filter(Boolean);
    const uniqueUrls = [...new Set(urls)];
    if (!uniqueUrls.length) continue;
    const username = typeof value.username === "string" ? value.username : undefined;
    const credential = typeof value.credential === "string" ? value.credential : undefined;
    const key = JSON.stringify([uniqueUrls, username ?? ""]);
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      urls: uniqueUrls.length === 1 ? uniqueUrls[0] : uniqueUrls,
      ...(username !== undefined ? { username } : {}),
      ...(credential !== undefined ? { credential } : {}),
    });
    if (normalized.length >= 8) break;
  }
  return normalized.length ? normalized : DEFAULT_SCREEN_SHARE_ICE_SERVERS;
}

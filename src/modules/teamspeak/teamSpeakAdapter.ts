import type { TeamSpeakProtocol } from "../../shared/teamSpeakProtocol.js";
import { teamSpeakTargetKey, type TeamSpeakTarget } from "../../shared/teamSpeakTarget.js";

interface CacheEntry {
  protocol: TeamSpeakProtocol;
  lastSuccessfulAt: number;
}

/** Process-local cache, the protocol is never persisted as user config. */
export class EndpointProtocolCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(
    private readonly ttlMs = 30 * 60 * 1000,
    private readonly maxEntries = 128,
  ) {}

  get(target: TeamSpeakTarget, now = Date.now()): TeamSpeakProtocol | undefined {
    const key = teamSpeakTargetKey(target);
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (now - entry.lastSuccessfulAt > this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.protocol;
  }

  set(target: TeamSpeakTarget, protocol: TeamSpeakProtocol, now = Date.now()): void {
    const key = teamSpeakTargetKey(target);
    this.entries.delete(key);
    this.entries.set(key, { protocol, lastSuccessfulAt: now });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

export const endpointProtocolCache = new EndpointProtocolCache();

export function detectTeamSpeakProtocol(versionText: string): TeamSpeakProtocol | null {
  const text = versionText.trim().toLowerCase();
  if (/teamspeak\s*6|(?:^|[^\d.])6\.\d+/.test(text)) return "ts6";
  if (/teamspeak\s*3|(?:^|\D)3\.\d+/.test(text)) return "ts3";
  return null;
}

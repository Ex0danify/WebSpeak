const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 30;

interface PeerWindow {
  startedAt: number;
  requests: number;
}

/** Bounds opaque join-ticket creation so one peer cannot fill the in-memory store. */
export class JoinRateLimiter {
  private readonly peers = new Map<string, PeerWindow>();

  constructor(private readonly maxTrackedPeers = 2048) {}

  allow(peer: string, now = Date.now()): boolean {
    const current = this.peers.get(peer);
    if (!current || now - current.startedAt >= WINDOW_MS) {
      this.prune(now);
      while (this.peers.size >= this.maxTrackedPeers) {
        const weakest = this.weakestPeer();
        if (weakest === undefined) break;
        this.peers.delete(weakest);
      }
      this.peers.set(peer, { startedAt: now, requests: 1 });
      return true;
    }
    if (current.requests >= MAX_REQUESTS) return false;
    current.requests += 1;
    return true;
  }

  /** The peer with the fewest requests, the oldest of them on a tie, so a peer at its limit outlives a flood of new peers. */
  private weakestPeer(): string | undefined {
    let weakest: string | undefined;
    let fewest = Infinity;
    for (const [peer, window] of this.peers) {
      if (window.requests < fewest) {
        weakest = peer;
        fewest = window.requests;
      }
    }
    return weakest;
  }

  private prune(now: number): void {
    for (const [peer, window] of this.peers) {
      if (now - window.startedAt >= WINDOW_MS) this.peers.delete(peer);
    }
  }
}

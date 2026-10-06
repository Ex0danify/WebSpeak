const WINDOW_MS = 5 * 60 * 1000;
const MAX_FAILURES = 5;

interface LoginAttempt {
  failures: number;
  firstFailureAt: number;
}

export class AdminLoginRateLimiter {
  private readonly attempts = new Map<string, LoginAttempt>();

  constructor(private readonly maxTrackedPeers = 1024) {}

  retryAfterMs(peer: string, now = Date.now()): number {
    const attempt = this.attempts.get(peer);
    if (!attempt) return 0;
    if (now - attempt.firstFailureAt >= WINDOW_MS) {
      this.attempts.delete(peer);
      return 0;
    }
    if (attempt.failures < MAX_FAILURES) return 0;
    return WINDOW_MS - (now - attempt.firstFailureAt);
  }

  recordFailure(peer: string, now = Date.now()): number {
    const current = this.attempts.get(peer);
    if (!current) {
      this.pruneExpired(now);
      while (this.attempts.size >= this.maxTrackedPeers) {
        const weakestPeer = this.weakestPeer();
        if (weakestPeer === undefined) break;
        this.attempts.delete(weakestPeer);
      }
    }
    const attempt = !current || now - current.firstFailureAt >= WINDOW_MS
      ? { failures: 1, firstFailureAt: now }
      : { ...current, failures: current.failures + 1 };
    this.attempts.set(peer, attempt);
    return Math.min(2000, 250 * (2 ** Math.min(3, attempt.failures - 1)));
  }

  recordSuccess(peer: string): void {
    this.attempts.delete(peer);
  }

  /** The peer with the fewest failures, the oldest of them on a tie, so a lockout outlives a flood of new peers. */
  private weakestPeer(): string | undefined {
    let weakest: string | undefined;
    let fewest = Infinity;
    for (const [peer, attempt] of this.attempts) {
      if (attempt.failures < fewest) {
        weakest = peer;
        fewest = attempt.failures;
      }
    }
    return weakest;
  }

  private pruneExpired(now: number): void {
    for (const [peer, attempt] of this.attempts) {
      if (now - attempt.firstFailureAt >= WINDOW_MS) this.attempts.delete(peer);
    }
  }
}

export function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

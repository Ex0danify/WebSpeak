const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 5 * 60_000;

interface Failures {
  count: number;
  retryAt: number;
}

/**
 * Slows down guessing a TeamSpeak server's password through the gateway. Each wrong password a visitor
 * supplied doubles the wait before the next one is accepted for that server, and an accepted one clears it.
 * Only passwords typed by the visitor count, the admin's own password is never guessed.
 */
export class ServerPasswordBackoff {
  private readonly failures = new Map<string, Failures>();

  constructor(private readonly maxTracked = 1024) {}

  /** Milliseconds until another password may be tried on `targetKey`, 0 when it may be tried now. */
  retryAfterMs(targetKey: string, now = Date.now()): number {
    const entry = this.failures.get(targetKey);
    return entry ? Math.max(0, entry.retryAt - now) : 0;
  }

  recordFailure(targetKey: string, now = Date.now()): void {
    const count = (this.failures.get(targetKey)?.count ?? 0) + 1;
    const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (count - 1));
    this.failures.delete(targetKey);
    while (this.failures.size >= this.maxTracked) {
      const oldest = this.failures.keys().next().value;
      if (oldest === undefined) break;
      this.failures.delete(oldest);
    }
    this.failures.set(targetKey, { count, retryAt: now + delay });
  }

  recordSuccess(targetKey: string): void {
    this.failures.delete(targetKey);
  }
}

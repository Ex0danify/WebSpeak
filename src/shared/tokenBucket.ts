/** A burst of `capacity` events, refilled at `perSecond`. The clock is injectable for tests. */
export class TokenBucket {
  private tokens: number;
  private updatedAt: number;

  constructor(
    private readonly capacity: number,
    private readonly perSecond: number,
    now = Date.now(),
  ) {
    this.tokens = capacity;
    this.updatedAt = now;
  }

  /** Takes one token, or returns false when the bucket is empty. */
  take(now = Date.now()): boolean {
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.updatedAt) / 1000) * this.perSecond);
    this.updatedAt = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** Counts events and tells when `limit` of them fall into one `windowMs`. */
export class WindowCounter {
  private count = 0;
  private startedAt = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Records one event, returns true once the window holds `limit` of them. */
  hit(now = Date.now()): boolean {
    if (now - this.startedAt >= this.windowMs) {
      this.startedAt = now;
      this.count = 0;
    }
    this.count += 1;
    return this.count >= this.limit;
  }
}

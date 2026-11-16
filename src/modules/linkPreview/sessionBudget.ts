import { TokenBucket } from "../../shared/tokenBucket.js";

const REQUEST_BURST = 8;
const REQUESTS_PER_SECOND = 1;
const BYTES_PER_WINDOW = 16 * 1024 * 1024;
const WINDOW_MS = 60_000;

/** What one session may ask of the fetcher: a burst of requests that refills over time, and a cap on the image bytes sent in a minute. */
export class LinkPreviewBudget {
  private readonly requests: TokenBucket;
  private windowStartedAt = 0;
  private bytes = 0;

  constructor(now = Date.now()) {
    this.requests = new TokenBucket(REQUEST_BURST, REQUESTS_PER_SECOND, now);
  }

  allowRequest(now = Date.now()): boolean {
    return this.requests.take(now);
  }

  /** Counts bytes about to be sent, false when this would go over the cap of the current minute. */
  spendBytes(count: number, now = Date.now()): boolean {
    if (now - this.windowStartedAt >= WINDOW_MS) {
      this.windowStartedAt = now;
      this.bytes = 0;
    }
    if (this.bytes + count > BYTES_PER_WINDOW) return false;
    this.bytes += count;
    return true;
  }
}

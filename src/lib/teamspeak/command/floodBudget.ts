export interface FloodBudgetOptions {
  /** Default 4, what the SDK used. The server's real point costs per command are unknown. */
  ratePerSecond?: number;
  /** Default 8. */
  burst?: number;
  /** Tokens at the start, default 5 like the SDK. */
  initial?: number;
}

/** Token bucket that keeps us below the server's anti-flood points. Time comes from the caller. */
export class FloodBudget {
  readonly #ratePerMs: number;
  readonly #burst: number;
  #tokens: number;
  #updatedAt: number;

  constructor(options: FloodBudgetOptions, now: number) {
    const rate = options.ratePerSecond ?? 4;
    this.#burst = options.burst ?? 8;
    if (!(rate > 0) || !(this.#burst >= 1)) throw new RangeError("Flood budget needs a positive rate and a burst of at least 1");
    this.#ratePerMs = rate / 1000;
    this.#tokens = Math.min(options.initial ?? 5, this.#burst);
    this.#updatedAt = now;
  }

  available(now: number): number {
    this.#refill(now);
    return this.#tokens;
  }

  /** Takes a token and returns 0, or returns how many ms until one is there and takes nothing. */
  take(now: number): number {
    this.#refill(now);
    if (this.#tokens >= 1) {
      this.#tokens -= 1;
      return 0;
    }
    // The tolerance keeps float noise (0.996 tokens after 249 ms) from adding a millisecond.
    return Math.max(1, Math.ceil((1 - this.#tokens) / this.#ratePerMs - 1e-9));
  }

  /** After a flood refusal the server's view is worse than ours, so start from empty. */
  drain(now: number): void {
    this.#refill(now);
    this.#tokens = 0;
  }

  #refill(now: number): void {
    if (now > this.#updatedAt) this.#tokens = Math.min(this.#burst, this.#tokens + (now - this.#updatedAt) * this.#ratePerMs);
    this.#updatedAt = Math.max(this.#updatedAt, now);
  }
}

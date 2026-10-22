import type { IdentityMintPolicy } from "../../config/identityMintConfig.js";
import { generateIdentityAsync, type Identity, type IdentitySearchOptions } from "../teamspeak/index.js";

/** Thrown by `submit` when the queue is already at `queueDepth`; the route turns it into a 429. */
export class QueueFullError extends Error {
  constructor(message = "identity mint queue is full") {
    super(message);
    this.name = "QueueFullError";
  }
}

export interface MintSubmitOptions {
  signal?: AbortSignal;
  /** Called with the number of waiters still ahead while this one sits in the queue. */
  onPosition?: (ahead: number) => void;
  /** Called once the worker for this request actually starts. */
  onStart?: () => void;
}

interface Waiter extends MintSubmitOptions {
  level: number;
  resolve: (identity: Identity) => void;
  reject: (error: unknown) => void;
  onAbort?: () => void;
}

type MintFn = (level: number, options: IdentitySearchOptions) => Promise<Identity>;

/**
 * Bounds the real CPU cost of minting: at most `concurrency` workers run at once, further requests
 * wait in a queue capped at `queueDepth`. Limits are read live from `policy`, so admin edits apply
 * without a restart. A waiter whose signal aborts leaves the line; an active one aborts its worker.
 */
export class IdentityMintQueue {
  #active = 0;
  readonly #waiters: Waiter[] = [];

  constructor(
    private readonly policy: () => IdentityMintPolicy,
    private readonly mint: MintFn = generateIdentityAsync,
  ) {}

  get activeCount(): number {
    return this.#active;
  }

  get queuedCount(): number {
    return this.#waiters.length;
  }

  /** Room for one more request right now, without it being rejected as over-depth. */
  hasCapacity(): boolean {
    return this.#active < this.policy().concurrency || this.#waiters.length < this.policy().queueDepth;
  }

  submit(level: number, options: MintSubmitOptions = {}): Promise<Identity> {
    const { signal } = options;
    if (signal?.aborted) return Promise.reject(signal.reason as Error);
    return new Promise<Identity>((resolve, reject) => {
      const waiter: Waiter = { ...options, level, resolve, reject };
      if (this.#active < this.policy().concurrency) {
        this.#start(waiter);
        return;
      }
      if (this.#waiters.length >= this.policy().queueDepth) {
        reject(new QueueFullError());
        return;
      }
      if (signal) {
        waiter.onAbort = () => this.#drop(waiter, signal.reason as Error);
        signal.addEventListener("abort", waiter.onAbort, { once: true });
      }
      this.#waiters.push(waiter);
      this.#emitPositions();
    });
  }

  #start(waiter: Waiter): void {
    this.#active += 1;
    waiter.onStart?.();
    this.mint(waiter.level, waiter.signal ? { signal: waiter.signal } : {})
      .then(waiter.resolve, waiter.reject)
      .finally(() => {
        this.#active -= 1;
        this.#pump();
      });
  }

  #pump(): void {
    // Waiters first so an empty queue never reads the policy, which may be gone during shutdown.
    while (this.#waiters.length > 0 && this.#active < this.#concurrency()) {
      const waiter = this.#waiters.shift()!;
      if (waiter.onAbort && waiter.signal) waiter.signal.removeEventListener("abort", waiter.onAbort);
      this.#start(waiter);
    }
    this.#emitPositions();
  }

  /** Zero when the limit can't be read (e.g. the gateway is shutting down), which stops pumping. */
  #concurrency(): number {
    try {
      return this.policy().concurrency;
    } catch {
      return 0;
    }
  }

  #drop(waiter: Waiter, error: Error): void {
    const index = this.#waiters.indexOf(waiter);
    if (index < 0) return;
    this.#waiters.splice(index, 1);
    waiter.reject(error);
    this.#emitPositions();
  }

  #emitPositions(): void {
    this.#waiters.forEach((waiter, index) => waiter.onPosition?.(index));
  }
}

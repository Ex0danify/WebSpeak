export interface KeepAliveOptions {
  /** Default 1 s. */
  pingIntervalMs?: number;
  /** Close when the server sent nothing valid for this long. Default 20 s. */
  idleTimeoutMs?: number;
}

/** Ping schedule and dead-peer detection. Idle detection runs from the start, pings once enabled. */
export class KeepAlive {
  readonly #pingIntervalMs: number;
  readonly #idleTimeoutMs: number;
  #lastReceivedAt: number;
  #nextPingAt: number | undefined;

  constructor({ pingIntervalMs = 1_000, idleTimeoutMs = 20_000 }: KeepAliveOptions, now: number) {
    this.#pingIntervalMs = pingIntervalMs;
    this.#idleTimeoutMs = idleTimeoutMs;
    this.#lastReceivedAt = now;
  }

  received(now: number): void {
    this.#lastReceivedAt = now;
  }

  startPinging(now: number): void {
    this.#nextPingAt ??= now + this.#pingIntervalMs;
  }

  /** True once per interval, the caller sends the ping. */
  takePing(now: number): boolean {
    if (this.#nextPingAt === undefined || now < this.#nextPingAt) return false;
    this.#nextPingAt = now + this.#pingIntervalMs;
    return true;
  }

  idle(now: number): boolean {
    return now - this.#lastReceivedAt >= this.#idleTimeoutMs;
  }

  nextDueAt(): number {
    const idleAt = this.#lastReceivedAt + this.#idleTimeoutMs;
    return this.#nextPingAt === undefined ? idleAt : Math.min(idleAt, this.#nextPingAt);
  }
}

import { idOf } from "./generationWindow.js";

export interface ResendOptions {
  /** RTO before the first round trip was measured. Default 1 s like RFC 6298. */
  initialRtoMs?: number;
  /** Default 100 ms. */
  minRtoMs?: number;
  /** Default 3 s, also the cap of the per-packet backoff. */
  maxRtoMs?: number;
  /** Close after this long without any ack while packets are pending. Default 30 s. */
  giveUpMs?: number;
  /** Packets between the oldest unacked one and the newest sent one. Default 256. */
  maxInFlight?: number;
}

const CLOCK_GRANULARITY_MS = 10;

/** Smoothed RTT after RFC 6298, shared by both command channels of a connection. */
export class RttEstimator {
  readonly #minRtoMs: number;
  readonly #maxRtoMs: number;
  #srtt: number | undefined;
  #rttvar = 0;
  #rto: number;

  constructor({ initialRtoMs = 1_000, minRtoMs = 100, maxRtoMs = 3_000 }: ResendOptions = {}) {
    this.#minRtoMs = minRtoMs;
    this.#maxRtoMs = maxRtoMs;
    this.#rto = Math.min(Math.max(initialRtoMs, minRtoMs), maxRtoMs);
  }

  get rtoMs(): number {
    return this.#rto;
  }

  get smoothedRttMs(): number | undefined {
    return this.#srtt;
  }

  sample(rttMs: number): void {
    if (this.#srtt === undefined) {
      this.#srtt = rttMs;
      this.#rttvar = rttMs / 2;
    } else {
      this.#rttvar = 0.75 * this.#rttvar + 0.25 * Math.abs(this.#srtt - rttMs);
      this.#srtt = 0.875 * this.#srtt + 0.125 * rttMs;
    }
    const rto = this.#srtt + Math.max(CLOCK_GRANULARITY_MS, 4 * this.#rttvar);
    this.#rto = Math.min(Math.max(rto, this.#minRtoMs), this.#maxRtoMs);
  }
}

interface Pending {
  index: number;
  datagram: Buffer;
  sentAt: number;
  retransmitted: boolean;
  timeoutMs: number;
}

/**
 * Resend queue of one reliable packet type. Datagrams are kept as sent, so a resend carries the
 * same bytes and key even when the keys changed in between.
 */
export class ReliableSender {
  readonly #rtt: RttEstimator;
  readonly #maxRtoMs: number;
  readonly #giveUpMs: number;
  readonly #maxInFlight: number;
  readonly #inFlight = new Map<number, Pending>();
  #backlog: { index: number; datagram: Buffer }[] = [];
  #backlogHead = 0;
  #oldest = Infinity;
  #newestSent = -1;
  #lastProgressAt = 0;
  // Never later than the earliest resend. Acks leave it low, which costs one extra scan at most.
  #resendDueAt = Infinity;

  constructor(rtt: RttEstimator, { maxRtoMs = 3_000, giveUpMs = 30_000, maxInFlight = 256 }: ResendOptions = {}) {
    this.#rtt = rtt;
    this.#maxRtoMs = maxRtoMs;
    this.#giveUpMs = giveUpMs;
    this.#maxInFlight = maxInFlight;
  }

  get pending(): number {
    return this.#inFlight.size + this.#backlog.length - this.#backlogHead;
  }

  /** Indexes must come in order, the next flush sends it when the window allows. */
  enqueue(index: number, datagram: Buffer): void {
    this.#backlog.push({ index, datagram });
  }

  /** Datagrams to write now: newly admitted ones, then due resends. */
  flush(now: number): Buffer[] {
    const out: Buffer[] = [];
    if (now >= this.#resendDueAt) {
      this.#resendDueAt = Infinity;
      for (const entry of this.#inFlight.values()) {
        if (now >= entry.sentAt + entry.timeoutMs) {
          entry.sentAt = now;
          entry.retransmitted = true;
          entry.timeoutMs = Math.min(entry.timeoutMs * 2, this.#maxRtoMs);
          out.push(entry.datagram);
        }
        this.#resendDueAt = Math.min(this.#resendDueAt, entry.sentAt + entry.timeoutMs);
      }
    }
    while (this.#backlogHead < this.#backlog.length) {
      const { index, datagram } = this.#backlog[this.#backlogHead];
      if (this.#inFlight.size > 0 && index - this.#oldest >= this.#maxInFlight) break;
      this.#backlogHead++;
      if (this.#inFlight.size === 0) {
        this.#oldest = index;
        this.#lastProgressAt = now;
      }
      this.#inFlight.set(index, { index, datagram, sentAt: now, retransmitted: false, timeoutMs: this.#rtt.rtoMs });
      this.#resendDueAt = Math.min(this.#resendDueAt, now + this.#rtt.rtoMs);
      this.#newestSent = index;
      out.push(datagram);
    }
    if (this.#backlogHead === this.#backlog.length) {
      this.#backlog = [];
      this.#backlogHead = 0;
    }
    return out;
  }

  /** False for acks of unknown or already acked packets. */
  acknowledge(id: number, now: number): boolean {
    // Everything in flight lies within maxInFlight below the newest sent index.
    const index = this.#newestSent - ((idOf(this.#newestSent) - id + 0x1_0000) % 0x1_0000);
    const entry = this.#inFlight.get(index);
    if (!entry) return false;
    // Karn: a resent packet's ack could belong to either copy, so it gives no RTT sample.
    if (!entry.retransmitted) this.#rtt.sample(now - entry.sentAt);
    this.#inFlight.delete(index);
    this.#lastProgressAt = now;
    // The map keeps send order, so its first key is the oldest packet in flight.
    if (index === this.#oldest) this.#oldest = this.#inFlight.keys().next().value ?? Infinity;
    return true;
  }

  /** True when packets are pending and no ack came for giveUpMs. */
  stalled(now: number): boolean {
    return this.#inFlight.size > 0 && now - this.#lastProgressAt >= this.#giveUpMs;
  }

  /** When flush or stalled next has something to do, undefined while idle. */
  nextDueAt(): number | undefined {
    if (this.#inFlight.size === 0) return undefined;
    return Math.min(this.#resendDueAt, this.#lastProgressAt + this.#giveUpMs);
  }

  /** Drops everything, for close. */
  clear(): void {
    this.#inFlight.clear();
    this.#backlog = [];
    this.#backlogHead = 0;
    this.#oldest = Infinity;
    this.#resendDueAt = Infinity;
  }
}

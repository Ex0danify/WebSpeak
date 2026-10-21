// Deterministic clock and an impaired datagram link for the own TeamSpeak client's transport tests.
import type { DatagramChannel, DatagramHandlers } from "../../src/lib/teamspeak/transport/udpChannel.js";
import type { TransportClock } from "../../src/lib/teamspeak/transport/packetHandler.js";

interface Timer {
  id: number;
  at: number;
  callback: () => void;
}

const before = (a: Timer, b: Timer) => a.at < b.at || (a.at === b.at && a.id < b.id);

/** Time only moves when a test moves it, timers run in due order (a binary heap, cleared ones are skipped). */
export class ManualClock implements TransportClock {
  #now = 0;
  #nextId = 1;
  readonly #heap: Timer[] = [];
  readonly #live = new Set<number>();

  now(): number {
    return this.#now;
  }

  setTimer(callback: () => void, delayMs: number): number {
    const timer = { id: this.#nextId++, at: this.#now + Math.max(0, delayMs), callback };
    this.#live.add(timer.id);
    this.#push(timer);
    return timer.id;
  }

  clearTimer(handle: unknown): void {
    this.#live.delete(handle as number);
  }

  get pendingTimers(): number {
    return this.#live.size;
  }

  /** Runs every timer due within `ms`, including those set while running. */
  advance(ms: number): void {
    const end = this.#now + ms;
    for (let timer = this.#earliest(); timer && timer.at <= end; timer = this.#earliest()) this.#run(timer);
    this.#now = end;
  }

  /** Jumps from timer to timer until `done` holds. Throws after `limitMs` of simulated time. */
  runUntil(done: () => boolean, limitMs = 600_000): void {
    const end = this.#now + limitMs;
    while (!done()) {
      const timer = this.#earliest();
      if (!timer || timer.at > end) throw new Error(`condition not reached within ${limitMs} ms of simulated time`);
      this.#run(timer);
    }
  }

  #earliest(): Timer | undefined {
    while (this.#heap.length > 0 && !this.#live.has(this.#heap[0].id)) this.#pop();
    return this.#heap[0];
  }

  #run(timer: Timer): void {
    this.#pop();
    this.#live.delete(timer.id);
    this.#now = Math.max(this.#now, timer.at);
    timer.callback();
  }

  #push(timer: Timer): void {
    const heap = this.#heap;
    let i = heap.push(timer) - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!before(heap[i], heap[parent])) break;
      [heap[i], heap[parent]] = [heap[parent], heap[i]];
      i = parent;
    }
  }

  #pop(): void {
    const heap = this.#heap;
    const last = heap.pop()!;
    if (heap.length === 0) return;
    heap[0] = last;
    for (let i = 0; ;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      if (left < heap.length && before(heap[left], heap[smallest])) smallest = left;
      if (right < heap.length && before(heap[right], heap[smallest])) smallest = right;
      if (smallest === i) return;
      [heap[i], heap[smallest]] = [heap[smallest], heap[i]];
      i = smallest;
    }
  }
}

/** mulberry32, enough randomness for loss patterns and repeatable from a seed. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

export interface LinkImpairment {
  /** Probability per datagram. */
  drop?: number;
  duplicate?: number;
  /** Probability of an extra delay of up to reorderMs, which lets later datagrams overtake. */
  reorder?: number;
  reorderMs?: number;
  /** One-way delay. Default 20 ms. */
  delayMs?: number;
  /** Drops a datagram when it returns true, on top of the random loss. */
  filter?: (datagram: Buffer, side: "a" | "b") => boolean;
}

export interface LinkStats {
  sent: number;
  dropped: number;
  duplicated: number;
}

class LinkEnd implements DatagramChannel {
  handlers: DatagramHandlers | undefined;
  closed = false;
  peer!: LinkEnd;

  constructor(readonly deliver: (datagram: Buffer, to: LinkEnd) => void) {}

  attach(handlers: DatagramHandlers): void {
    this.handlers = handlers;
  }

  send(datagram: Uint8Array): void {
    if (!this.closed) this.deliver(Buffer.from(datagram), this.peer);
  }

  close(): void {
    this.closed = true;
  }
}

/** Two connected channels. `a` is the client side by convention. */
export function createLink(clock: ManualClock, impairment: LinkImpairment = {}, seed = 1) {
  const random = seededRandom(seed);
  const stats: LinkStats = { sent: 0, dropped: 0, duplicated: 0 };
  const { drop = 0, duplicate = 0, reorder = 0, reorderMs = 50, delayMs = 20, filter } = impairment;
  const schedule = (datagram: Buffer, to: LinkEnd) => {
    const delay = delayMs + (random() < reorder ? random() * reorderMs : 0);
    clock.setTimer(() => {
      if (!to.closed) to.handlers?.message(datagram);
    }, delay);
  };
  const deliver = (datagram: Buffer, to: LinkEnd) => {
    stats.sent++;
    if (filter?.(datagram, to === b ? "a" : "b") || random() < drop) {
      stats.dropped++;
      return;
    }
    schedule(datagram, to);
    if (random() < duplicate) {
      stats.duplicated++;
      schedule(Buffer.from(datagram), to);
    }
  };
  const a = new LinkEnd(deliver);
  const b = new LinkEnd(deliver);
  a.peer = b;
  b.peer = a;
  return { a, b, stats };
}

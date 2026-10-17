// Packet ids are 16 bit, every wrap starts a new generation. Internally a packet is known by its
// index `generation * 65536 + id`.

const ID_SPACE = 0x1_0000;
const HALF = ID_SPACE / 2;

export const generationOf = (index: number) => Math.floor(index / ID_SPACE);
export const idOf = (index: number) => index % ID_SPACE;

/** Maps incoming 16-bit ids to indexes next to the expected one. */
export class GenerationWindow {
  #next: number;

  constructor(next = 0) {
    this.#next = next;
  }

  /** Index of the next packet in order. */
  get next(): number {
    return this.#next;
  }

  /**
   * The index closest to `next` with this id, up to half the id space away in either direction.
   * Can be negative right after the start, which callers treat like any old packet.
   */
  resolve(id: number): number {
    const delta = ((((id - this.#next) % ID_SPACE) + ID_SPACE + HALF) % ID_SPACE) - HALF;
    return this.#next + delta;
  }

  /** Moves `next` past `index`, never back. */
  passed(index: number): void {
    if (index >= this.#next) this.#next = index + 1;
  }
}

/** Ids and generations for one outgoing packet type. */
export class PacketIdCounter {
  #next: number;

  constructor(next = 0) {
    this.#next = next;
  }

  get next(): number {
    return this.#next;
  }

  take(): number {
    return this.#next++;
  }
}

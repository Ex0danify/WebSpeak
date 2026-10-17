import { type AssembledMessage, type PacketPart, takeMessage } from "./fragmenter.js";
import { GenerationWindow } from "./generationWindow.js";

export interface ReceiveOptions {
  /** Packets accepted ahead of the next expected one. Default 1024. */
  windowSize?: number;
  /** Largest reassembled command. Default 1 MiB. */
  maxMessageBytes?: number;
}

export type ReceiveVerdict = "new" | "duplicate" | "ahead";

/**
 * In-order delivery of one reliable packet type. Nothing is ever skipped: a gap waits until the
 * peer resends the missing packet.
 */
export class ReliableReceiver {
  readonly #window: GenerationWindow;
  readonly #windowSize: number;
  readonly #maxMessageBytes: number;
  readonly #buffer = new Map<number, PacketPart>();

  constructor({ windowSize = 1024, maxMessageBytes = 1024 * 1024 }: ReceiveOptions = {}, next = 0) {
    this.#window = new GenerationWindow(next);
    this.#windowSize = windowSize;
    this.#maxMessageBytes = maxMessageBytes;
  }

  get next(): number {
    return this.#window.next;
  }

  resolve(id: number): number {
    return this.#window.resolve(id);
  }

  /**
   * "new" and "duplicate" packets are acked, "ahead" packets lie beyond the window and are dropped
   * unacked so the peer resends them later.
   */
  classify(index: number): ReceiveVerdict {
    if (index < this.#window.next || this.#buffer.has(index)) return "duplicate";
    return index - this.#window.next >= this.#windowSize ? "ahead" : "new";
  }

  /** Stores a packet that classify called new and returns the messages that are complete now, in order. */
  accept(index: number, part: PacketPart): AssembledMessage[] {
    this.#buffer.set(index, part);
    const messages: AssembledMessage[] = [];
    for (;;) {
      const message = takeMessage(this.#buffer, this.#window.next, this.#maxMessageBytes);
      if (!message) return messages;
      this.#window.passed(this.#window.next + message.count - 1);
      messages.push(message);
    }
  }
}

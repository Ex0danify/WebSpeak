import type { Page } from "@playwright/test";
import { poll, type PollOptions } from "./poll";

export type GatewayMessage = { type: string } & Record<string, unknown>;

/**
 * A page plus what its `/ws/voice` socket carried. Attach before the first navigation, Playwright only reports sockets that
 * open after it started listening. Frames are kept in memory as the browser sees them, only counted and not logged.
 */
export class Session {
  /** JSON the gateway sent to the browser. */
  readonly received: GatewayMessage[] = [];
  /** JSON the browser sent to the gateway. */
  readonly sent: GatewayMessage[] = [];
  /** Binary frames the gateway sent (relayed Opus). */
  binaryReceived = 0;
  /** Binary frames the browser sent (PCM). */
  binarySent = 0;
  readonly pageErrors: string[] = [];

  private constructor(readonly page: Page) {
    page.on("pageerror", (error) => this.pageErrors.push(String(error)));
    page.on("websocket", (socket) => {
      socket.on("framereceived", (frame) => this.record(frame.payload, this.received, () => this.binaryReceived++));
      socket.on("framesent", (frame) => this.record(frame.payload, this.sent, () => this.binarySent++));
    });
  }

  static attach(page: Page): Session {
    return new Session(page);
  }

  private record(payload: string | Buffer, into: GatewayMessage[], countBinary: () => void): void {
    if (typeof payload !== "string") return countBinary();
    try {
      into.push(JSON.parse(payload) as GatewayMessage);
    } catch {
      // not JSON, nothing in the protocol
    }
  }

  /** Messages of one type the gateway sent. */
  of(type: string): GatewayMessage[] {
    return this.received.filter((message) => message.type === type);
  }

  /** Where the received list ends now, to look only at what comes later with `since(mark)`. */
  mark(): number {
    return this.received.length;
  }

  /** The first message of `type` received after `mark` (default ever), waited for by polling. */
  async waitForMessage(type: string, options: PollOptions & { after?: number } = {}): Promise<GatewayMessage> {
    const { after = 0, ...poller } = options;
    const found = await poll(
      () => this.received.slice(after).find((message) => message.type === type),
      (message) => message !== undefined,
      {
        message: `a "${type}" message`,
        ...poller,
      },
    );
    return found!;
  }

  /** Waits until at least `count` more binary frames than `before` came in (or went out with `direction: "sent"`). */
  async waitForBinary(count: number, direction: "received" | "sent" = "received", options: PollOptions = {}): Promise<number> {
    const read = () => (direction === "received" ? this.binaryReceived : this.binarySent);
    const before = read();
    await poll(read, (value) => value >= before + count, { message: `${count} binary frames ${direction}`, ...options });
    return read();
  }
}

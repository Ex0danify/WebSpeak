import WebSocket, { type RawData } from "ws";

export type JsonMessage = { type: string } & Record<string, unknown>;

export type WsFrame = { kind: "json"; message: JsonMessage } | { kind: "text"; text: string } | { kind: "binary"; data: Buffer };

export interface WaitOptions {
  /** Only look at frames recorded after `mark()` returned this index. Default: all frames. */
  after?: number;
  /** Failure deadline in milliseconds, not a delay: the wait ends as soon as the condition holds. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 3000;

interface Waiter {
  after: number;
  predicate: (frame: WsFrame) => boolean;
  resolve: (frame: WsFrame) => void;
}

/** A WebSocket that records every frame it receives and waits for conditions, never for time. */
export class WsClient {
  readonly frames: WsFrame[] = [];
  closeInfo: { code: number; reason: string } | null = null;
  /** True once `close()` was called, so a later `closeInfo` is known to be our own doing. */
  closedLocally = false;
  private waiters = new Set<Waiter>();
  private closeListeners = new Set<() => void>();

  private constructor(private readonly socket: WebSocket) {
    socket.on("message", (data: RawData, isBinary: boolean) => this.record(data, isBinary));
    socket.on("close", (code: number, reason: Buffer) => {
      this.closeInfo = { code, reason: reason.toString() };
      for (const listener of this.closeListeners) listener();
    });
    socket.on("error", () => {
      /* the close event carries the outcome */
    });
  }

  /** Resolves once the socket is open. Rejects when the upgrade is refused. */
  static open(url: string, headers: Record<string, string> = {}): Promise<WsClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url, { headers });
      const client = new WsClient(socket);
      socket.once("open", () => resolve(client));
      socket.once("unexpected-response", (_request, response) =>
        reject(new Error(`WebSocket upgrade refused with HTTP ${response.statusCode}`)),
      );
      socket.once("error", (error: Error) => reject(error));
    });
  }

  get messages(): JsonMessage[] {
    return this.frames.flatMap((frame) => (frame.kind === "json" ? [frame.message] : []));
  }

  get binary(): Buffer[] {
    return this.frames.flatMap((frame) => (frame.kind === "binary" ? [frame.data] : []));
  }

  messagesOfType(type: string): JsonMessage[] {
    return this.messages.filter((message) => message.type === type);
  }

  /** The number of frames recorded so far; pass it as `after` to ignore everything before it. */
  mark(): number {
    return this.frames.length;
  }

  send(message: { type: string; payload?: Record<string, unknown>; requestId?: string }): void {
    this.socket.send(JSON.stringify({ payload: {}, ...message }));
  }

  sendRaw(data: string | Buffer): void {
    this.socket.send(data);
  }

  waitForFrame(predicate: (frame: WsFrame) => boolean, options: WaitOptions = {}): Promise<WsFrame> {
    const after = options.after ?? 0;
    const recorded = this.frames.slice(after).find(predicate);
    if (recorded) return Promise.resolve(recorded);
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        after,
        predicate,
        resolve: (frame) => {
          done();
          resolve(frame);
        },
      };
      const onClose = () => {
        done();
        reject(new Error(`socket closed while waiting: ${this.describe()}`));
      };
      const timer = setTimeout(() => {
        done();
        reject(new Error(`timed out waiting for a frame: ${this.describe()}`));
      }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      const done = () => {
        clearTimeout(timer);
        this.waiters.delete(waiter);
        this.closeListeners.delete(onClose);
      };
      this.waiters.add(waiter);
      // A close that already happened is reported by describe(), so only wait for a later one.
      if (this.closeInfo) onClose();
      else this.closeListeners.add(onClose);
    });
  }

  /** Resolves with the first JSON message of `type` (or matching the predicate). */
  async waitForMessage(match: string | ((message: JsonMessage) => boolean), options: WaitOptions = {}): Promise<JsonMessage> {
    const test = typeof match === "string" ? (message: JsonMessage) => message.type === match : match;
    const frame = await this.waitForFrame((candidate) => candidate.kind === "json" && test(candidate.message), options);
    return (frame as Extract<WsFrame, { kind: "json" }>).message;
  }

  /** Resolves with every binary frame after `after` once there are at least `count` of them. */
  async waitForBinaryCount(count: number, options: WaitOptions = {}): Promise<Buffer[]> {
    const after = options.after ?? 0;
    const collect = () => this.frames.slice(after).flatMap((frame) => (frame.kind === "binary" ? [frame.data] : []));
    await this.waitForFrame(() => collect().length >= count, options);
    return collect();
  }

  waitForClose(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<{ code: number; reason: string }> {
    if (this.closeInfo) return Promise.resolve(this.closeInfo);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.closeListeners.delete(onClose);
        reject(new Error(`timed out waiting for close: ${this.describe()}`));
      }, timeoutMs);
      const onClose = () => {
        clearTimeout(timer);
        resolve(this.closeInfo!);
      };
      this.closeListeners.add(onClose);
    });
  }

  /**
   * Stops reading from the network, like a browser whose tab is stuck, so what the
   * gateway sends piles up on its side. `ws` has no public API for this.
   */
  pauseReading(): void {
    (this.socket as unknown as { _socket: { pause(): void } })._socket.pause();
  }

  resumeReading(): void {
    (this.socket as unknown as { _socket: { resume(): void } })._socket.resume();
  }

  close(): void {
    this.closedLocally = true;
    if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) this.socket.close();
  }

  private record(data: RawData, isBinary: boolean): void {
    let frame: WsFrame;
    if (isBinary) {
      frame = { kind: "binary", data: Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer) };
    } else {
      const text = data.toString();
      frame = { kind: "text", text };
      try {
        const parsed: unknown = JSON.parse(text);
        if (parsed && typeof parsed === "object" && typeof (parsed as { type?: unknown }).type === "string")
          frame = { kind: "json", message: parsed as JsonMessage };
      } catch {
        /* stays a text frame */
      }
    }
    this.frames.push(frame);
    for (const waiter of [...this.waiters]) {
      if (this.frames.length - 1 >= waiter.after && waiter.predicate(frame)) waiter.resolve(frame);
    }
  }

  private describe(): string {
    const tail = this.frames.slice(-8).map((frame) => (frame.kind === "json" ? frame.message.type : frame.kind));
    const closed = this.closeInfo ? `closed ${this.closeInfo.code} "${this.closeInfo.reason}"` : "still open";
    return `${this.frames.length} frames, last: [${tail.join(", ")}], ${closed}`;
  }
}

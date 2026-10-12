// Test-only stand-in for the gateway socket. It records what the composable sends and lets a test
// push text (JSON) and binary frames back, the same two frame kinds the real /ws/voice carries.

export type SentFrame = string | ArrayBuffer | ArrayBufferView | Blob;

export class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  readyState = FakeWebSocket.CONNECTING;
  binaryType: BinaryType = "blob";
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  readonly sent: SentFrame[] = [];
  /** What `bufferedAmount` reports. Set it directly, or turn on `accumulateBuffered` to grow it per send. */
  bufferedAmount = 0;
  accumulateBuffered = false;
  closedWith: { code?: number; reason?: string } | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  static reset(): void {
    FakeWebSocket.instances = [];
  }

  static get last(): FakeWebSocket {
    const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
    if (!socket) throw new Error("no FakeWebSocket has been opened");
    return socket;
  }

  send(data: SentFrame): void {
    this.sent.push(data);
    if (this.accumulateBuffered && typeof data !== "string" && !(data instanceof Blob)) this.bufferedAmount += data.byteLength;
  }

  /** The browser closing the socket, it stays CLOSING until the test calls `serverClose`. */
  close(code?: number, reason?: string): void {
    this.closedWith = { code, reason };
    this.readyState = FakeWebSocket.CLOSING;
  }

  /** The handshake completing. */
  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({});
  }

  /** The gateway pushing a JSON control frame. */
  receive(message: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  /** The gateway pushing a raw text frame (used for malformed-frame cases). */
  receiveText(text: string): void {
    this.onmessage?.({ data: text });
  }

  /** The gateway pushing a binary frame (Opus relay: `[codec][clientId BE]` header plus payload). */
  receiveBinary(bytes: Uint8Array): void {
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    this.onmessage?.({ data: copy });
  }

  /** The gateway or network closing the socket. */
  serverClose(code = 1000, reason = ""): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }

  /** Every JSON text frame the composable has sent, parsed. */
  get sentJson(): Record<string, unknown>[] {
    return this.sent
      .filter((frame): frame is string => typeof frame === "string")
      .map((frame) => JSON.parse(frame) as Record<string, unknown>);
  }

  /** Every binary frame the composable has sent (PCM uplink). */
  get sentBinary(): (ArrayBuffer | ArrayBufferView)[] {
    return this.sent.filter((frame): frame is ArrayBuffer | ArrayBufferView => typeof frame !== "string" && !(frame instanceof Blob));
  }

  sentOfType(type: string): Record<string, unknown>[] {
    return this.sentJson.filter((frame) => frame.type === type);
  }
}

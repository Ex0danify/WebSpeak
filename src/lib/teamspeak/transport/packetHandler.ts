import type { PacketDirection } from "../crypto/packetKeys.js";
import { TeamSpeakTransportError } from "../errors/teamSpeakErrors.js";
import { splitPayload } from "./fragmenter.js";
import { GenerationWindow, idOf, PacketIdCounter } from "./generationWindow.js";
import { KeepAlive, type KeepAliveOptions } from "./keepAlive.js";
import { encodePacket, openPacket, parsePacket, type ParsedPacket } from "./packetCodec.js";
import { type KeySwitch, PacketProtection } from "./packetProtection.js";
import { INIT1_PACKET_ID, isReliable, maxPayloadBytes, PACKET_TYPE_COUNT, PacketFlag, PacketType } from "./packetTypes.js";
import { decompressQuickLz } from "./quickLz.js";
import { type ReceiveOptions, ReliableReceiver } from "./reliableReceiver.js";
import { ReliableSender, type ResendOptions, RttEstimator } from "./reliableSender.js";
import type { DatagramChannel } from "./udpChannel.js";

export interface TransportClock {
  now(): number;
  setTimer(callback: () => void, delayMs: number): unknown;
  clearTimer(handle: unknown): void;
}

export const systemClock: TransportClock = {
  now: () => performance.now(),
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Pino compatible. */
export interface TransportLogger {
  debug(fields: object, message: string): void;
}

export interface PacketHandlerOptions {
  /** The server role exists for the loopback test server. */
  role?: "client" | "server";
  clock?: TransportClock;
  logger?: TransportLogger;
  resend?: ResendOptions;
  receive?: ReceiveOptions;
  keepAlive?: KeepAliveOptions;
  maxDecompressedBytes?: number;
}

export type ReliableType = typeof PacketType.command | typeof PacketType.commandLow;
export type VoiceType = typeof PacketType.voice | typeof PacketType.voiceWhisper;

export interface CommandMessage {
  type: ReliableType;
  /** Flags of the first packet, without Fragmented and Compressed. */
  flags: number;
  payload: Buffer;
}

export interface VoicePacket {
  type: VoiceType;
  flags: number;
  index: number;
  /** Sender's client id from the header, set in the server role only. */
  clientId: number;
  payload: Buffer;
}

export interface PacketHandlerEvents {
  command(message: CommandMessage): void;
  voice?(packet: VoicePacket): void;
  init1?(payload: Buffer): void;
  /** Once, after the socket is closed. Undefined for a close the owner asked for. */
  closed(error: TeamSpeakTransportError | undefined): void;
}

interface ReliableChannel {
  sender: ReliableSender;
  receiver: ReliableReceiver;
}

interface PendingInit1 {
  datagram: Buffer;
  firstSentAt: number;
  sentAt: number;
  timeoutMs: number;
}

const u16 = (value: number) => {
  const bytes = Buffer.allocUnsafe(2);
  bytes.writeUInt16BE(value, 0);
  return bytes;
};

/**
 * One connection's packet layer: ids and generations, encryption, acks and resends, fragments,
 * decompression, ping and pong. Everything runs on one timer, set for whatever is due first.
 */
export class PacketHandler {
  readonly protection: PacketProtection;
  /** Goes into the header of every client packet once the server assigned it. */
  clientId = 0;

  readonly #channel: DatagramChannel;
  readonly #events: PacketHandlerEvents;
  readonly #clock: TransportClock;
  readonly #logger: TransportLogger | undefined;
  readonly #role: "client" | "server";
  readonly #sendDirection: PacketDirection;
  readonly #receiveDirection: PacketDirection;
  readonly #counters = Array.from({ length: PACKET_TYPE_COUNT }, () => new PacketIdCounter());
  readonly #windows = Array.from({ length: PACKET_TYPE_COUNT }, () => new GenerationWindow());
  readonly #rtt: RttEstimator;
  readonly #reliable: Record<ReliableType, ReliableChannel>;
  readonly #keepAlive: KeepAlive;
  readonly #giveUpMs: number;
  readonly #maxRtoMs: number;
  readonly #maxDecompressedBytes: number | undefined;
  #init1: PendingInit1 | undefined;
  #timer: unknown;
  #timerAt = Infinity;
  #closed = false;

  constructor(channel: DatagramChannel, events: PacketHandlerEvents, options: PacketHandlerOptions = {}) {
    this.#channel = channel;
    this.#events = events;
    this.#clock = options.clock ?? systemClock;
    this.#logger = options.logger;
    this.#role = options.role ?? "client";
    this.#sendDirection = this.#role === "client" ? "c2s" : "s2c";
    this.#receiveDirection = this.#role === "client" ? "s2c" : "c2s";
    this.protection = new PacketProtection(this.#sendDirection);
    this.#rtt = new RttEstimator(options.resend);
    const reliable = () => ({ sender: new ReliableSender(this.#rtt, options.resend), receiver: new ReliableReceiver(options.receive) });
    this.#reliable = { [PacketType.command]: reliable(), [PacketType.commandLow]: reliable() };
    this.#keepAlive = new KeepAlive(options.keepAlive ?? {}, this.#clock.now());
    this.#giveUpMs = options.resend?.giveUpMs ?? 30_000;
    this.#maxRtoMs = options.resend?.maxRtoMs ?? 3_000;
    this.#maxDecompressedBytes = options.maxDecompressedBytes;
    channel.attach({ message: (datagram) => this.#onDatagram(datagram), error: (error) => this.close(error) });
    this.#schedule();
  }

  get closed(): boolean {
    return this.#closed;
  }

  get smoothedRttMs(): number | undefined {
    return this.#rtt.smoothedRttMs;
  }

  /** Commands sent and not acked yet, both priorities. */
  get pendingCommands(): number {
    return this.#reliable[PacketType.command].sender.pending + this.#reliable[PacketType.commandLow].sender.pending;
  }

  /**
   * For the Init1 handshake, which carries `clientinitiv` inside Init1 where it still takes command
   * id 0. Call before the first command in either role.
   */
  skipInitCommand(): void {
    if (this.#role === "client") this.#counters[PacketType.command].take();
    else this.#reliable[PacketType.command].receiver.skip(0);
  }

  /** Sends a command reliably, split when it does not fit one packet. `compressed` marks QuickLZ data. */
  sendCommand(payload: Buffer, options: { low?: boolean; compressed?: boolean } = {}): void {
    if (this.#closed) return;
    const type = options.low ? PacketType.commandLow : PacketType.command;
    let flags = options.compressed ? PacketFlag.compressed : 0;
    if (this.#role === "client") flags |= PacketFlag.newProtocol;
    const { sender } = this.#reliable[type];
    for (const part of splitPayload(payload, maxPayloadBytes(this.#sendDirection), flags)) {
      const index = this.#counters[type].take();
      sender.enqueue(index, this.#encode(type, part.flags, index, part.payload));
    }
    this.#write(sender.flush(this.#clock.now()));
    this.#schedule();
  }

  /** Sends one Init1 step. In the client role it is resent until the server answers with the next step. */
  sendInit1(payload: Buffer): void {
    if (this.#closed) return;
    const datagram = encodePacket(
      this.#sendDirection,
      { type: PacketType.init1, flags: PacketFlag.unencrypted, id: INIT1_PACKET_ID, payload },
      undefined,
      this.protection.fakeMac,
    );
    this.#write([datagram]);
    if (this.#role === "server") return;
    const now = this.#clock.now();
    this.#init1 = { datagram, firstSentAt: now, sentAt: now, timeoutMs: this.#rtt.rtoMs };
    this.#schedule();
  }

  /** For a handshake that moves on without another Init1 from the server. */
  stopInit1Resend(): void {
    this.#init1 = undefined;
  }

  /** Voice and whisper are unreliable. The packet id goes in front of `body`, as both layouts start with it. */
  sendVoice(type: VoiceType, body: Uint8Array, flags = 0): void {
    if (this.#closed) return;
    const index = this.#counters[type].take();
    const payload = Buffer.allocUnsafe(2 + body.length);
    payload.writeUInt16BE(idOf(index), 0);
    payload.set(body, 2);
    this.#write([this.#encode(type, flags, index, payload)]);
  }

  switchKeys(next: KeySwitch): void {
    const cursors = this.#windows.map((window, type) => (isReliable(type) ? this.#reliable[type].receiver.next : window.next));
    this.protection.switchKeys(next, cursors);
    this.#logger?.debug({ step: "switchKeys" }, "TeamSpeak packet keys switched");
  }

  /** Pings once per interval from now on, for after the handshake. */
  startKeepAlive(): void {
    this.#keepAlive.startPinging(this.#clock.now());
    this.#schedule();
  }

  close(error?: TeamSpeakTransportError): void {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#timer !== undefined) this.#clock.clearTimer(this.#timer);
    this.#timer = undefined;
    for (const { sender } of Object.values(this.#reliable)) sender.clear();
    this.#init1 = undefined;
    this.#channel.close();
    this.#logger?.debug({ code: error?.code }, "TeamSpeak transport closed");
    this.#events.closed(error);
  }

  #encode(type: PacketType, flags: number, index: number, payload: Uint8Array): Buffer {
    const key = flags & PacketFlag.unencrypted ? undefined : this.protection.sealKey(type, index);
    const fields = { type, flags, id: idOf(index), clientId: this.clientId, payload };
    return encodePacket(this.#sendDirection, fields, key, this.protection.fakeMac);
  }

  #write(datagrams: Buffer[]): void {
    for (const datagram of datagrams) this.#channel.send(datagram);
  }

  #open(packet: ParsedPacket, index: number): Buffer | undefined {
    if (packet.flags & PacketFlag.unencrypted) return openPacket(packet, undefined, this.protection.expectedFakeMac);
    for (const key of this.protection.openKeys(packet.type, index)) {
      const payload = openPacket(packet, key, undefined);
      if (payload) return payload;
    }
    return undefined;
  }

  #onDatagram(datagram: Buffer): void {
    if (this.#closed) return;
    const packet = parsePacket(this.#receiveDirection, datagram);
    if (!packet) return;
    const now = this.#clock.now();
    switch (packet.type) {
      case PacketType.init1:
        this.#onInit1(packet, now);
        break;
      case PacketType.ping:
      case PacketType.pong:
        this.#onPing(packet, now);
        break;
      case PacketType.ack:
      case PacketType.ackLow:
        this.#onAck(packet, now);
        break;
      case PacketType.command:
      case PacketType.commandLow:
        this.#onCommand(packet, packet.type, now);
        break;
      default:
        this.#onVoice(packet, packet.type, now);
    }
    this.#schedule();
  }

  #onInit1(packet: ParsedPacket, now: number): void {
    const payload = openPacket(packet, undefined, undefined);
    if (!payload) return;
    this.#keepAlive.received(now);
    this.#init1 = undefined;
    this.#events.init1?.(payload);
  }

  #onPing(packet: ParsedPacket, now: number): void {
    if (!(packet.flags & PacketFlag.unencrypted) || !this.#open(packet, packet.id)) return;
    this.#keepAlive.received(now);
    if (packet.type === PacketType.ping) {
      const index = this.#counters[PacketType.pong].take();
      this.#write([this.#encode(PacketType.pong, PacketFlag.unencrypted, index, u16(packet.id))]);
    }
  }

  #onAck(packet: ParsedPacket, now: number): void {
    const window = this.#windows[packet.type];
    const index = window.resolve(packet.id);
    const payload = this.#open(packet, index);
    if (!payload || payload.length < 2) return;
    window.passed(index);
    this.#keepAlive.received(now);
    const { sender } = this.#reliable[packet.type === PacketType.ack ? PacketType.command : PacketType.commandLow];
    if (sender.acknowledge(payload.readUInt16BE(0), now)) this.#write(sender.flush(now));
  }

  #onCommand(packet: ParsedPacket, type: ReliableType, now: number): void {
    // Commands are always encrypted, an unencrypted one is forged or broken.
    if (packet.flags & PacketFlag.unencrypted) return;
    const { receiver } = this.#reliable[type];
    const index = receiver.resolve(packet.id);
    const verdict = receiver.classify(index);
    if (verdict === "ahead") return;
    const payload = this.#open(packet, index);
    if (!payload) return;
    this.#keepAlive.received(now);
    const ackType = type === PacketType.command ? PacketType.ack : PacketType.ackLow;
    this.#write([this.#encode(ackType, 0, this.#counters[ackType].take(), u16(packet.id))]);
    if (verdict === "duplicate") return;
    try {
      for (const message of receiver.accept(index, { flags: packet.flags, payload })) {
        const compressed = (message.flags & PacketFlag.compressed) !== 0;
        const body = compressed ? decompressQuickLz(message.payload, this.#maxDecompressedBytes) : message.payload;
        this.#events.command({ type, flags: message.flags & ~PacketFlag.compressed, payload: body });
        if (this.#closed) return;
      }
    } catch (error) {
      // A command that cannot be read breaks the stream for good, skipping it would lose state.
      if (!(error instanceof TeamSpeakTransportError)) throw error;
      this.close(error);
    }
  }

  #onVoice(packet: ParsedPacket, type: VoiceType, now: number): void {
    const window = this.#windows[type];
    const index = window.resolve(packet.id);
    const payload = this.#open(packet, index);
    if (!payload) return;
    window.passed(index);
    this.#keepAlive.received(now);
    this.#events.voice?.({ type, flags: packet.flags, index, clientId: packet.clientId, payload });
  }

  #schedule(): void {
    if (this.#closed) return;
    let due = this.#keepAlive.nextDueAt();
    for (const { sender } of Object.values(this.#reliable)) due = Math.min(due, sender.nextDueAt() ?? Infinity);
    if (this.#init1) due = Math.min(due, this.#init1.sentAt + this.#init1.timeoutMs, this.#init1.firstSentAt + this.#giveUpMs);
    if (this.#timer !== undefined && this.#timerAt <= due) return;
    if (this.#timer !== undefined) this.#clock.clearTimer(this.#timer);
    this.#timerAt = due;
    this.#timer = this.#clock.setTimer(() => this.#onTimer(), Math.max(0, due - this.#clock.now()));
  }

  #onTimer(): void {
    this.#timer = undefined;
    this.#timerAt = Infinity;
    if (this.#closed) return;
    const now = this.#clock.now();
    if (this.#keepAlive.idle(now)) return this.close(new TeamSpeakTransportError("timeout", "no packet from the peer in time"));
    for (const { sender } of Object.values(this.#reliable)) {
      if (sender.stalled(now)) return this.close(new TeamSpeakTransportError("ackTimeout", "commands are not acknowledged"));
      this.#write(sender.flush(now));
    }
    const init1 = this.#init1;
    if (init1 && now - init1.firstSentAt >= this.#giveUpMs) return this.close(new TeamSpeakTransportError("timeout", "no answer to Init1"));
    if (init1 && now >= init1.sentAt + init1.timeoutMs) {
      init1.sentAt = now;
      init1.timeoutMs = Math.min(init1.timeoutMs * 2, this.#maxRtoMs);
      this.#write([init1.datagram]);
    }
    if (this.#keepAlive.takePing(now)) {
      this.#write([this.#encode(PacketType.ping, PacketFlag.unencrypted, this.#counters[PacketType.ping].take(), Buffer.alloc(0))]);
    }
    this.#schedule();
  }
}

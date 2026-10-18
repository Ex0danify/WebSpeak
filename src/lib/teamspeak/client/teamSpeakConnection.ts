import { EventEmitter } from "node:events";
import { clientDisconnect } from "../command/clientCommands.js";
import { CommandScheduler, type CommandSchedulerOptions, type ScheduledCommandOptions } from "../command/commandScheduler.js";
import { type CommandInput, CommandTracker, type CommandTrackerOptions, type ServerCommand } from "../command/commandTracker.js";
import { TeamSpeakError, TeamSpeakTransportError } from "../errors/teamSpeakErrors.js";
import { readDownload, type TcpConnect } from "../fileTransfer/fileDownload.js";
import { type DownloadRequest, FileTransferTickets, ftInitDownload } from "../fileTransfer/fileTransferTickets.js";
import { connectLegacy, type LegacyConnection, type LegacyHandshakeOptions } from "../handshake/legacyHandshake.js";
import { type SessionView, SessionState } from "../session/sessionState.js";
import { type PacketHandler, systemClock, type VoicePacket, type VoiceType } from "../transport/packetHandler.js";
import { PacketFlag, PacketType } from "../transport/packetTypes.js";
import { type DatagramChannelFactory, openUdpChannel, type UdpAddress } from "../transport/udpChannel.js";
import type { CommandRow } from "../wire/commandRows.js";
import type { ConnectionEvent, ConnectionEventMap } from "./clientEvents.js";
import {
  buildVoiceBody,
  buildWhisperBody,
  parseServerVoice,
  VoiceCodec,
  type VoiceEncryption,
  voiceEncrypted,
  type WhisperTargets,
} from "./clientVoice.js";

export interface TeamSpeakConnectionOptions extends Omit<LegacyHandshakeOptions, "signal" | "timeoutMs"> {
  /** Already resolved and checked by the caller. */
  address: UdpAddress;
  /** Handshake and welcome together. Default 20 s. */
  timeoutMs?: number;
  /** How long `disconnect()` waits for the server to confirm our leave. Default 2 s. */
  disconnectTimeoutMs?: number;
  socketFactory?: DatagramChannelFactory;
  tracker?: Pick<CommandTrackerOptions, "defaultTimeoutMs" | "maxRows">;
  scheduler?: Omit<CommandSchedulerOptions, "clock">;
  /** Default `auto`, see VoiceEncryption. */
  voiceEncryption?: VoiceEncryption;
  /** Opens the TCP connection to the file transfer port. */
  fileTransferConnect?: TcpConnect;
}

export interface DownloadFileOptions extends Pick<ScheduledCommandOptions, "priority" | "signal"> {
  /** Larger files are refused before the transfer starts. */
  maxBytes: number;
  /** Of the file server, default the connection's host. Behind a relay, pass the server's real host. */
  host?: string;
  /** For each step: the command, the ticket, the transfer. Default 10 s. */
  timeoutMs?: number;
}

export type ConnectionState = "idle" | "connecting" | "connected" | "closed";

const abortReason = (signal: AbortSignal) => (signal.reason instanceof Error ? signal.reason : new Error("aborted"));

/**
 * One connection to a TeamSpeak server. Events come synchronously and in server order, after the
 * session state already shows the change. A listener that throws does not stop the others or the
 * connection; its error is thrown again on a microtask.
 */
export class TeamSpeakConnection extends EventEmitter<ConnectionEventMap> {
  readonly #options: TeamSpeakConnectionOptions;
  readonly #clock;
  readonly #logger;
  readonly #session = new SessionState();
  readonly #tracker: CommandTracker;
  readonly #scheduler: CommandScheduler;
  readonly #transfers: FileTransferTickets;
  #state: ConnectionState = "idle";
  #handler: PacketHandler | undefined;
  #connecting: Promise<void> | undefined;
  #connectAbort: AbortController | undefined;
  #leaving: Promise<void> | undefined;
  #welcomeDone: ((error?: Error) => void) | undefined;
  #welcomeFailure: Error | undefined;
  readonly #closeWaiters: (() => void)[] = [];

  constructor(options: TeamSpeakConnectionOptions) {
    super();
    this.#options = options;
    this.#clock = options.transport?.clock ?? systemClock;
    this.#logger = options.transport?.logger;
    this.#tracker = new CommandTracker(
      { sendCommand: (payload) => this.#handler?.sendCommand(payload) },
      { notification: (command) => this.#onNotification(command) },
      { clock: this.#clock, logger: this.#logger, ...options.tracker },
    );
    this.#scheduler = new CommandScheduler(this.#tracker, { ...options.scheduler, clock: this.#clock });
    this.#transfers = new FileTransferTickets(this.#clock);
  }

  get state(): ConnectionState {
    return this.#state;
  }

  get session(): SessionView {
    return this.#session;
  }

  get clientId(): number {
    return this.#session.self.clientId;
  }

  /** Resolves once the welcome is complete. Runs once per connection object. */
  connect(options: { signal?: AbortSignal } = {}): Promise<void> {
    if (this.#state !== "idle") return Promise.reject(new TeamSpeakError("A TeamSpeakConnection connects only once"));
    this.#state = "connecting";
    this.#connecting = this.#connect(options.signal);
    return this.#connecting;
  }

  /** Resolves with the answer rows, rejects with the TeamSpeakServerError for a refusal. */
  command(input: CommandInput, options?: ScheduledCommandOptions): Promise<CommandRow[]> {
    if (this.#state === "idle" || this.#state === "connecting") return Promise.reject(this.#notConnected());
    return this.#scheduler.command(input, options);
  }

  /** Without a return code, the server does not answer. */
  send(input: CommandInput, options?: Pick<ScheduledCommandOptions, "priority" | "signal">): void {
    if (this.#state === "idle" || this.#state === "connecting") throw this.#notConnected();
    this.#scheduler.send(input, options);
  }

  /** A whole file from the server's file transfer port, such as an avatar. */
  async downloadFile(request: DownloadRequest, options: DownloadFileOptions): Promise<Buffer> {
    if (this.#state !== "connected") throw this.#notConnected();
    const { maxBytes, signal, priority } = options;
    const timeoutMs = options.timeoutMs ?? 10_000;
    const transfer = this.#transfers.open();
    try {
      await this.command(ftInitDownload(transfer.clientTransferId, request), { signal, priority, timeoutMs });
      const ticket = await transfer.ticket(timeoutMs, signal);
      const host = options.host ?? this.#options.address.host;
      return await readDownload({ host, ticket, maxBytes, timeoutMs, signal, connect: this.#options.fileTransferConnect });
    } finally {
      transfer.release();
    }
  }

  /** Opus frame to our channel. Dropped while not connected, like any lost voice packet. */
  sendVoice(data: Uint8Array, codec: number = VoiceCodec.opusVoice): void {
    this.#sendVoice(PacketType.voice, buildVoiceBody(data, codec), 0);
  }

  /** Throws a RangeError for targets the server cannot take, also while not connected. */
  sendWhisper(data: Uint8Array, targets: WhisperTargets, codec: number = VoiceCodec.opusVoice): void {
    const { body, flags } = buildWhisperBody(data, targets, codec);
    this.#sendVoice(PacketType.voiceWhisper, body, flags);
  }

  #sendVoice(type: VoiceType, body: Buffer, flags: number): void {
    if (this.#state !== "connected" || !this.#handler) return;
    const { server, self } = this.#session;
    const encrypted = voiceEncrypted(this.#options.voiceEncryption ?? "auto", server, this.#session.channel(self.channelId));
    this.#handler.sendVoice(type, body, encrypted ? flags : flags | PacketFlag.unencrypted);
  }

  /** Leaves with `clientdisconnect`, or stops a connect that is still running. */
  async disconnect(options: { reasonMessage?: string } = {}): Promise<void> {
    if (this.#state === "idle") {
      this.#state = "closed";
      this.#scheduler.close();
    } else if (this.#state === "connecting") {
      this.#connectAbort?.abort(new TeamSpeakTransportError("closed", "TeamSpeak connection closed while connecting"));
      await this.#connecting?.catch(() => undefined);
    } else if (this.#state === "connected") {
      this.#leaving ??= this.#leave(options.reasonMessage);
      await this.#leaving;
    }
  }

  async #leave(reasonMessage: string | undefined): Promise<void> {
    const closed = new Promise<void>((resolve) => this.#closeWaiters.push(resolve));
    this.#scheduler.send(clientDisconnect(reasonMessage), { priority: "interactive" });
    const timer = this.#clock.setTimer(() => this.#handler?.close(), this.#options.disconnectTimeoutMs ?? 2_000);
    await closed;
    this.#clock.clearTimer(timer);
  }

  async #connect(signal: AbortSignal | undefined): Promise<void> {
    const abort = new AbortController();
    this.#connectAbort = abort;
    const onAbort = () => abort.abort(signal!.reason);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
    const started = this.#clock.now();
    const timeoutMs = this.#options.timeoutMs ?? 20_000;
    try {
      const channel = await (this.#options.socketFactory ?? openUdpChannel)(this.#options.address, abort.signal);
      if (abort.signal.aborted) {
        channel.close();
        throw abortReason(abort.signal);
      }
      await connectLegacy(
        channel,
        { ...this.#options, timeoutMs, signal: abort.signal },
        {
          established: (connection) => this.#onEstablished(connection),
          command: (message) => this.#tracker.receive(message),
          voice: (packet) => this.#onVoice(packet),
          closed: (error) => this.#onClosed(error),
        },
      );
      await this.#waitForWelcome(timeoutMs - (this.#clock.now() - started), abort.signal);
      this.#state = "connected";
      this.#logger?.debug(
        { step: "welcome", channels: this.#session.channels().length, clients: this.#session.clients().length },
        "TeamSpeak welcome complete",
      );
    } catch (error) {
      this.#state = "closed";
      this.#handler?.close();
      this.#scheduler.close();
      throw error;
    } finally {
      signal?.removeEventListener("abort", onAbort);
      this.#connectAbort = undefined;
    }
  }

  #waitForWelcome(remainingMs: number, signal: AbortSignal): Promise<void> {
    if (this.#session.welcomeComplete) return Promise.resolve();
    // The connection can close in the same burst as initserver, before this wait starts.
    if (this.#welcomeFailure) return Promise.reject(this.#welcomeFailure);
    return new Promise((resolve, reject) => {
      const onAbort = () => done(abortReason(signal));
      const timer = this.#clock.setTimer(
        () => done(new TeamSpeakTransportError("timeout", "TeamSpeak welcome did not finish in time")),
        Math.max(0, remainingMs),
      );
      const done = (error?: Error) => {
        this.#clock.clearTimer(timer);
        signal.removeEventListener("abort", onAbort);
        this.#welcomeDone = undefined;
        if (error) reject(error);
        else resolve();
      };
      this.#welcomeDone = done;
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  #onEstablished(connection: LegacyConnection): void {
    this.#handler = connection.handler;
    this.#session.start(connection.initServer, connection.clientId);
  }

  #onNotification(command: ServerCommand): void {
    if (this.#transfers.receive(command.name, command.rows[0])) return;
    let selfLeft = false;
    for (const event of this.#session.apply(command)) {
      this.#emit(event);
      if (event.type === "welcomeComplete") this.#welcomeDone?.();
      if (event.type === "selfLeft") selfLeft = true;
    }
    // The server is done with us and sends nothing more.
    if (selfLeft) this.#handler?.close();
  }

  #onVoice(packet: VoicePacket): void {
    if (this.listenerCount("voice") === 0) return;
    const voice = parseServerVoice(packet);
    // Our own voice, should a server echo it.
    if (voice && voice.clientId !== this.#session.self.clientId) this.#emit(voice);
  }

  #onClosed(error: TeamSpeakTransportError | undefined): void {
    const wasConnected = this.#state === "connected";
    this.#state = "closed";
    this.#scheduler.close(error);
    this.#transfers.close(error ?? new TeamSpeakTransportError("closed", "TeamSpeak connection closed"));
    if (!this.#session.welcomeComplete) {
      this.#welcomeFailure = error ?? new TeamSpeakTransportError("closedByServer", "TeamSpeak closed the connection during the welcome");
      this.#welcomeDone?.(this.#welcomeFailure);
    }
    for (const resolve of this.#closeWaiters.splice(0)) resolve();
    if (wasConnected) this.#emit({ type: "closed", error });
  }

  #emit(event: ConnectionEvent): void {
    // rawListeners keeps the once() wrappers, so calling them still removes them.
    for (const listener of (this as EventEmitter).rawListeners(event.type)) {
      try {
        listener.call(this, event);
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }

  #notConnected(): TeamSpeakError {
    return new TeamSpeakError(`TeamSpeak connection is ${this.#state}, not connected`);
  }
}

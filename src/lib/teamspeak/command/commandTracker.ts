import { CommandTimeoutError, TeamSpeakTransportError } from "../errors/teamSpeakErrors.js";
import { type CommandMessage, systemClock, type TransportClock, type TransportLogger } from "../transport/packetHandler.js";
import { PacketType } from "../transport/packetTypes.js";
import { type CommandRow, DEFAULT_MAX_COMMAND_ROWS } from "../wire/commandRows.js";
import { buildCommand, type CommandParams, parseCommand, type ParsedCommand } from "../wire/commandText.js";
import { serverErrorFromRow } from "../wire/serverErrorRow.js";

export interface CommandRequest {
  name: string;
  params?: CommandParams;
  /** Further rows after the first. */
  rows?: readonly CommandParams[];
  flags?: readonly string[];
}

/** A request, or command text that is already escaped. */
export type CommandInput = CommandRequest | string;

export interface CommandSink {
  sendCommand(payload: Buffer): void;
}

/** A notification or another named command from the server, everything that is not an answer. */
export interface ServerCommand {
  name: string;
  flags: readonly string[];
  rows: readonly CommandRow[];
  /** Came on the CommandLow channel. */
  low: boolean;
}

export interface CommandTrackerEvents {
  notification(command: ServerCommand): void;
}

export interface CommandOptions {
  signal?: AbortSignal;
  /** From the moment the command goes out. */
  timeoutMs?: number;
}

export interface CommandTrackerOptions {
  clock?: TransportClock;
  logger?: TransportLogger;
  /** Default 10 s, like the SDK. */
  defaultTimeoutMs?: number;
  /** Rows one answer may collect. */
  maxRows?: number;
}

interface Pending {
  name: string;
  returnCode: string;
  rows: CommandRow[];
  timeoutMs: number;
  deadline: number;
  /** Undefined once the caller gave up: the entry stays queued so its late answer is dropped, not given to the next command. */
  settle: { resolve(rows: CommandRow[]): void; reject(error: Error): void } | undefined;
  detach(): void;
}

// Server→client commands with a name, from the native client's handler table. A leading bare token
// that is none of these starts an answer row (`client_default_channel …`).
const NAMED_SERVER_COMMANDS = new Set([
  "channellist",
  "channellistfinished",
  "error",
  "initivexpand",
  "initivexpand2",
  "initivxalpha",
  "initserver",
  "rd",
  "setwhisperlist",
]);

const isServerCommandName = (name: string) => name.startsWith("notify") || NAMED_SERVER_COMMANDS.has(name);

function requestText(input: CommandInput): { name: string; text: string } {
  if (typeof input !== "string") return { name: input.name, text: buildCommand(input.name, input.params, input) };
  const text = input.trim();
  if (!text) throw new TypeError("TeamSpeak command text is empty");
  return { name: text.split(" ", 1)[0], text };
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("aborted");
}

/**
 * Pairs commands with their answers. Every command carries a return code, because the server answers
 * only those (verified on TS3 3.13.7 and TS6 beta13.1). It answers in order, so answer rows belong to
 * the oldest command still waiting, and its `error` row with the return code ends that answer.
 */
export class CommandTracker {
  readonly #sink: CommandSink;
  readonly #events: CommandTrackerEvents;
  readonly #clock: TransportClock;
  readonly #logger: TransportLogger | undefined;
  readonly #defaultTimeoutMs: number;
  readonly #maxRows: number;
  readonly #queue: Pending[] = [];
  #nextReturnCode = 1;
  #timer: unknown;
  #timerAt = Infinity;
  #closedWith: TeamSpeakTransportError | undefined;

  constructor(sink: CommandSink, events: CommandTrackerEvents, options: CommandTrackerOptions = {}) {
    this.#sink = sink;
    this.#events = events;
    this.#clock = options.clock ?? systemClock;
    this.#logger = options.logger;
    this.#defaultTimeoutMs = options.defaultTimeoutMs ?? 10_000;
    this.#maxRows = options.maxRows ?? DEFAULT_MAX_COMMAND_ROWS;
  }

  /** Commands whose caller still waits. */
  get pending(): number {
    return this.#queue.filter((entry) => entry.settle).length;
  }

  /** Resolves with the answer rows, rejects with the TeamSpeakServerError for `error id≠0`. */
  command(input: CommandInput, options: CommandOptions = {}): Promise<CommandRow[]> {
    const { name, text } = requestText(input);
    if (/(^|\s)return_code=/.test(text)) throw new TypeError("TeamSpeak command text must not carry its own return_code");
    if (this.#closedWith) return Promise.reject(this.#closedWith);
    const { signal } = options;
    if (signal?.aborted) return Promise.reject(abortReason(signal));

    return new Promise((resolve, reject) => {
      const returnCode = String(this.#nextReturnCode++);
      const timeoutMs = options.timeoutMs ?? this.#defaultTimeoutMs;
      const onAbort = () => this.#abandon(entry, abortReason(signal!));
      const entry: Pending = {
        name,
        returnCode,
        rows: [],
        timeoutMs,
        deadline: this.#clock.now() + timeoutMs,
        settle: { resolve, reject },
        detach: () => signal?.removeEventListener("abort", onAbort),
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      this.#queue.push(entry);
      this.#schedule();
      this.#sink.sendCommand(Buffer.from(`${text} return_code=${returnCode}`));
    });
  }

  /** Sends without a return code, the server does not answer it. */
  send(input: CommandInput): void {
    if (this.#closedWith) return;
    this.#sink.sendCommand(Buffer.from(requestText(input).text));
  }

  /** Every command message after the handshake comes through here, in order. */
  receive(message: CommandMessage): void {
    const command = this.#parse(message.payload.toString("utf8"));
    if (command.name === "error") return this.#onError(command.rows[0]);
    if (command.name === undefined) return this.#onAnswerRows(command.rows);
    this.#collectTagged(command.rows);
    this.#events.notification({
      name: command.name,
      flags: command.flags,
      rows: command.rows,
      low: message.type === PacketType.commandLow,
    });
  }

  /** Rejects every waiting command. Without an error the close was ours. */
  close(error?: TeamSpeakTransportError): void {
    if (this.#closedWith) return;
    this.#closedWith = error ?? new TeamSpeakTransportError("closed", "TeamSpeak connection closed");
    this.#clock.clearTimer(this.#timer);
    this.#timerAt = Infinity;
    for (const entry of this.#queue.splice(0)) this.#settle(entry, this.#closedWith);
  }

  #parse(text: string): ParsedCommand {
    const command = parseCommand(text, { maxRows: this.#maxRows });
    if (command.name === undefined || isServerCommandName(command.name)) return command;
    return parseCommand(text, { nameless: true, maxRows: this.#maxRows });
  }

  #onError(row: CommandRow): void {
    const error = serverErrorFromRow(row);
    const index = this.#queue.findIndex((entry) => entry.returnCode === row.return_code);
    if (index < 0) {
      this.#logger?.debug({ returnCode: row.return_code }, "TeamSpeak answer without a waiting command");
      return;
    }
    // Answers come in order, so anything sent before this command will not be answered any more.
    // The rows filed under those belong to this answer.
    const skipped = this.#queue.splice(0, index);
    const entry = this.#queue.shift()!;
    for (const earlier of skipped) {
      this.#settle(earlier, new TeamSpeakTransportError("malformedData", `TeamSpeak skipped the answer to ${earlier.name}`));
    }
    this.#settle(entry, error, [...skipped.flatMap((earlier) => earlier.rows), ...entry.rows]);
    this.#schedule();
  }

  #onAnswerRows(rows: readonly CommandRow[]): void {
    const entry = this.#queue[0];
    if (!entry) {
      this.#logger?.debug({ rows: rows.length }, "TeamSpeak answer rows without a waiting command");
      return;
    }
    this.#append(entry, rows);
  }

  // permeffective is answered by a notification carrying the return code, its rows belong to the answer too.
  #collectTagged(rows: readonly CommandRow[]): void {
    const returnCode = rows[0]?.return_code;
    const entry = returnCode ? this.#queue.find((candidate) => candidate.returnCode === returnCode) : undefined;
    if (entry) this.#append(entry, rows);
  }

  #append(entry: Pending, rows: readonly CommandRow[]): void {
    if (entry.rows.length + rows.length > this.#maxRows) {
      throw new TeamSpeakTransportError("malformedData", `TeamSpeak answer to ${entry.name} has more than ${this.#maxRows} rows`);
    }
    entry.rows.push(...rows);
  }

  #settle(entry: Pending, error: Error | undefined, rows: CommandRow[] = []): void {
    const settle = entry.settle;
    if (!settle) return;
    entry.settle = undefined;
    entry.detach();
    if (error) settle.reject(error);
    else settle.resolve(rows);
  }

  #abandon(entry: Pending, error: Error): void {
    this.#settle(entry, error);
    this.#schedule();
  }

  #schedule(): void {
    let next = Infinity;
    for (const entry of this.#queue) if (entry.settle && entry.deadline < next) next = entry.deadline;
    if (next === this.#timerAt) return;
    this.#clock.clearTimer(this.#timer);
    this.#timerAt = next;
    if (next === Infinity) return;
    this.#timer = this.#clock.setTimer(() => this.#onTimer(), next - this.#clock.now());
  }

  #onTimer(): void {
    this.#timerAt = Infinity;
    const now = this.#clock.now();
    for (const entry of this.#queue) {
      if (entry.settle && entry.deadline <= now) this.#abandon(entry, new CommandTimeoutError(entry.name, entry.timeoutMs));
    }
    this.#schedule();
  }
}

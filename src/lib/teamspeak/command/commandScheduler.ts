import { TeamSpeakErrorId } from "../errors/errorIds.js";
import { TeamSpeakServerError, TeamSpeakTransportError } from "../errors/teamSpeakErrors.js";
import { systemClock, type TransportClock } from "../transport/packetHandler.js";
import type { CommandRow } from "../wire/commandRows.js";
import type { CommandInput, CommandOptions, CommandTracker } from "./commandTracker.js";
import { FloodBudget, type FloodBudgetOptions } from "./floodBudget.js";

/**
 * Interactive commands go first and as soon as the budget allows. Background commands run one at a
 * time in order, so a flood retry cannot overtake a later state change (mute on, mute off).
 */
export type CommandPriority = "interactive" | "background";

export interface ScheduledCommandOptions extends CommandOptions {
  priority?: CommandPriority;
}

export interface CommandSchedulerOptions {
  clock?: TransportClock;
  budget?: FloodBudgetOptions;
  /** Retries of a background command the server refused as flooding. Default 3. */
  floodRetries?: number;
  /** Before the first retry, doubled for every further one. Default 1.5 s. */
  floodRetryDelayMs?: number;
}

type TrackerLike = Pick<CommandTracker, "command" | "send" | "close">;

interface Queued {
  input: CommandInput;
  /** Undefined for `send`, which has no answer. */
  settle: { resolve(rows: CommandRow[]): void; reject(error: Error): void } | undefined;
  options: ScheduledCommandOptions;
  attempt: number;
  notBefore: number;
  detach(): void;
}

const isFlood = (error: unknown) => error instanceof TeamSpeakServerError && error.id === TeamSpeakErrorId.clientIsFlooding;
const abortReason = (signal: AbortSignal) => (signal.reason instanceof Error ? signal.reason : new Error("aborted"));

/** Sends commands through the tracker within the flood budget. */
export class CommandScheduler {
  readonly #tracker: TrackerLike;
  readonly #clock: TransportClock;
  readonly #budget: FloodBudget;
  readonly #floodRetries: number;
  readonly #floodRetryDelayMs: number;
  readonly #interactive: Queued[] = [];
  readonly #background: Queued[] = [];
  #backgroundBusy = false;
  #timer: unknown;
  #timerAt = Infinity;
  #closedWith: TeamSpeakTransportError | undefined;

  constructor(tracker: TrackerLike, options: CommandSchedulerOptions = {}) {
    this.#tracker = tracker;
    this.#clock = options.clock ?? systemClock;
    this.#budget = new FloodBudget(options.budget ?? {}, this.#clock.now());
    this.#floodRetries = options.floodRetries ?? 3;
    this.#floodRetryDelayMs = options.floodRetryDelayMs ?? 1_500;
  }

  /** Commands not sent yet. */
  get queued(): number {
    return this.#interactive.length + this.#background.length;
  }

  command(input: CommandInput, options: ScheduledCommandOptions = {}): Promise<CommandRow[]> {
    return new Promise((resolve, reject) => this.#enqueue(input, options, { resolve, reject }));
  }

  /** No return code and no answer, but it waits for the budget like any other command. */
  send(input: CommandInput, options: Pick<ScheduledCommandOptions, "priority" | "signal"> = {}): void {
    this.#enqueue(input, options, undefined);
  }

  /** Rejects queued and sent commands. Without an error the close was ours. */
  close(error?: TeamSpeakTransportError): void {
    if (this.#closedWith) return;
    this.#closedWith = error ?? new TeamSpeakTransportError("closed", "TeamSpeak connection closed");
    this.#tracker.close(this.#closedWith);
    this.#clock.clearTimer(this.#timer);
    this.#timerAt = Infinity;
    for (const item of [...this.#interactive.splice(0), ...this.#background.splice(0)]) {
      item.detach();
      item.settle?.reject(this.#closedWith);
    }
  }

  #enqueue(input: CommandInput, options: ScheduledCommandOptions, settle: Queued["settle"]): void {
    if (this.#closedWith) return settle?.reject(this.#closedWith);
    if (options.signal?.aborted) return settle?.reject(abortReason(options.signal));
    const item: Queued = { input, settle, options, attempt: 0, notBefore: 0, detach: () => undefined };
    const queue = options.priority === "background" ? this.#background : this.#interactive;
    this.#watchAbort(item, queue);
    queue.push(item);
    this.#pump();
  }

  /** An abort takes the item out of the queue while it waits, the tracker handles it once sent. */
  #watchAbort(item: Queued, queue: Queued[]): void {
    const signal = item.options.signal;
    if (!signal) return;
    const onAbort = () => {
      const index = queue.indexOf(item);
      if (index < 0) return;
      queue.splice(index, 1);
      item.settle?.reject(abortReason(signal));
      this.#pump();
    };
    signal.addEventListener("abort", onAbort, { once: true });
    item.detach = () => signal.removeEventListener("abort", onAbort);
  }

  #next(now: number): { queue: Queued[]; waitMs: number } | undefined {
    if (this.#interactive.length > 0) return { queue: this.#interactive, waitMs: 0 };
    const head = this.#background[0];
    if (!head || this.#backgroundBusy) return undefined;
    return { queue: this.#background, waitMs: Math.max(0, head.notBefore - now) };
  }

  #pump(): void {
    while (!this.#closedWith) {
      const now = this.#clock.now();
      const next = this.#next(now);
      if (!next) return this.#arm(Infinity);
      const waitMs = next.waitMs || this.#budget.take(now);
      if (waitMs > 0) return this.#arm(now + waitMs);
      const item = next.queue.shift()!;
      item.detach();
      this.#dispatch(item, next.queue === this.#background);
    }
  }

  #dispatch(item: Queued, background: boolean): void {
    if (!item.settle) return this.#tracker.send(item.input);
    const settle = item.settle;
    const { signal, timeoutMs } = item.options;
    if (background) this.#backgroundBusy = true;
    const finish = (then: () => void) => {
      if (background) this.#backgroundBusy = false;
      then();
      this.#pump();
    };
    this.#tracker.command(item.input, { signal, timeoutMs }).then(
      (rows) => finish(() => settle.resolve(rows)),
      (error: Error) => {
        if (isFlood(error)) this.#budget.drain(this.#clock.now());
        const retry = background && isFlood(error) && item.attempt < this.#floodRetries && !this.#closedWith;
        if (!retry) return finish(() => settle.reject(error));
        item.notBefore = this.#clock.now() + this.#floodRetryDelayMs * 2 ** item.attempt;
        item.attempt += 1;
        this.#watchAbort(item, this.#background);
        finish(() => this.#background.unshift(item));
      },
    );
  }

  #arm(at: number): void {
    if (at === this.#timerAt) return;
    this.#clock.clearTimer(this.#timer);
    this.#timerAt = at;
    if (at === Infinity) return;
    this.#timer = this.#clock.setTimer(() => {
      this.#timerAt = Infinity;
      this.#pump();
    }, at - this.#clock.now());
  }
}

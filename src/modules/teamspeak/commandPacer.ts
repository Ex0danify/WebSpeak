import { normalizeTeamSpeakError } from "../../shared/errors.js";

export interface CommandPacerOptions {
  /** Minimum time between the start of two paced commands. */
  spacingMs?: number;
  /** How many times a command refused by flood protection is tried again. */
  retries?: number;
  /** Wait before the first retry, it doubles for every further one. */
  retryDelayMs?: number;
  isFlood?: (error: unknown) => boolean;
}

export interface CommandPacer {
  run<T>(command: () => Promise<T>): Promise<T>;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms).unref?.());

const isFloodError = (error: unknown) => normalizeTeamSpeakError(error).code === "flooding";

/**
 * Runs background commands one at a time with a gap, so the post-connect burst (subscribe, snapshot, mute sync,
 * member lookups) stays under TS's flood budget, with retries after a flood refusal. Interactive commands skip it.
 */
export function createCommandPacer(options: CommandPacerOptions = {}): CommandPacer {
  const spacingMs = options.spacingMs ?? 120;
  const retries = options.retries ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 1500;
  const isFlood = options.isFlood ?? isFloodError;
  let tail: Promise<unknown> = Promise.resolve();
  let lastStartedAt = 0;

  async function runOnce<T>(command: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      const gap = lastStartedAt + spacingMs - Date.now();
      if (gap > 0) await wait(gap);
      lastStartedAt = Date.now();
      try {
        return await command();
      } catch (error: unknown) {
        if (attempt >= retries || !isFlood(error)) throw error;
        await wait(retryDelayMs * 2 ** attempt);
      }
    }
  }

  return {
    run<T>(command: () => Promise<T>): Promise<T> {
      const result = tail.then(() => runOnce(command));
      tail = result.catch(() => undefined);
      return result;
    },
  };
}

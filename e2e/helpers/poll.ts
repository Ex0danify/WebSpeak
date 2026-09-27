export interface PollOptions {
  /** Failure deadline in milliseconds, not a delay: the poll ends as soon as the condition holds. */
  timeoutMs?: number;
  intervalMs?: number;
  /** What the poll was waiting for, for the error text. */
  message?: string;
}

/**
 * Reads until `accept` likes the value and returns it. For state that lives outside the page
 * (the fake TeamSpeak server, a recorded socket); a page condition is a `expect(locator)` wait.
 */
export async function poll<T>(read: () => T | Promise<T>, accept: (value: T) => boolean, options: PollOptions = {}): Promise<T> {
  const { timeoutMs = 5000, intervalMs = 25, message = "the condition" } = options;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (accept(value)) return value;
    if (Date.now() >= deadline) throw new Error(`Timed out after ${timeoutMs} ms waiting for ${message}; last value: ${JSON.stringify(value)}`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

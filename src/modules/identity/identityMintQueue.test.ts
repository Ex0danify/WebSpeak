import { describe, expect, it, vi } from "vitest";
import { IdentityMintQueue, QueueFullError } from "./identityMintQueue.js";
import { generateIdentity, type Identity } from "../../lib/teamspeak/index.js";
import type { IdentityMintPolicy } from "../../config/identityMintConfig.js";

const SAMPLE = generateIdentity(0);

/** Lets the mint promise's `.then`/`.finally` chain settle before the next assertion. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const policy = (over: Partial<IdentityMintPolicy> = {}) => (): IdentityMintPolicy => ({
  maxLevel: 24,
  concurrency: 1,
  queueDepth: 10,
  ...over,
});

/** A mint whose promises stay pending until the test resolves them, so timing is deterministic. */
function deferredMint() {
  const pending: { resolve: (id: Identity) => void; reject: (error: unknown) => void; signal?: AbortSignal }[] = [];
  const mint = vi.fn((_level: number, options: { signal?: AbortSignal }) => {
    return new Promise<Identity>((resolve, reject) => pending.push({ resolve, reject, signal: options.signal }));
  });
  return { mint, pending };
}

describe("IdentityMintQueue", () => {
  it("runs up to concurrency workers at once and queues the rest", async () => {
    const { mint, pending } = deferredMint();
    const queue = new IdentityMintQueue(policy({ concurrency: 2 }), mint);

    void queue.submit(8);
    void queue.submit(8);
    const third = queue.submit(8);
    expect(mint).toHaveBeenCalledTimes(2);
    expect(queue.activeCount).toBe(2);
    expect(queue.queuedCount).toBe(1);

    pending[0].resolve(SAMPLE);
    await flush();
    expect(mint).toHaveBeenCalledTimes(3);
    expect(queue.queuedCount).toBe(0);
    pending[2].resolve(SAMPLE);
    await expect(third).resolves.toBe(SAMPLE);
  });

  it("reports how many waiters are ahead and updates as the line moves", async () => {
    const { mint, pending } = deferredMint();
    const queue = new IdentityMintQueue(policy({ concurrency: 1, queueDepth: 5 }), mint);
    const aheadB: number[] = [];
    const aheadC: number[] = [];

    void queue.submit(8);
    void queue.submit(8, { onPosition: (ahead) => aheadB.push(ahead) });
    void queue.submit(8, { onPosition: (ahead) => aheadC.push(ahead) });
    expect(aheadB.at(-1)).toBe(0);
    expect(aheadC.at(-1)).toBe(1);

    pending[0].resolve(SAMPLE);
    await flush();
    expect(aheadC.at(-1)).toBe(0);
  });

  it("rejects submissions past the queue depth with QueueFullError", async () => {
    const { mint } = deferredMint();
    const queue = new IdentityMintQueue(policy({ concurrency: 1, queueDepth: 1 }), mint);

    void queue.submit(8);
    void queue.submit(8);
    await expect(queue.submit(8)).rejects.toBeInstanceOf(QueueFullError);
    expect(queue.hasCapacity()).toBe(false);
  });

  it("drops an aborted waiter from the line without freeing an active slot", async () => {
    const { mint } = deferredMint();
    const queue = new IdentityMintQueue(policy({ concurrency: 1, queueDepth: 5 }), mint);
    const controller = new AbortController();

    void queue.submit(8);
    const queued = queue.submit(8, { signal: controller.signal });
    expect(queue.queuedCount).toBe(1);

    controller.abort(new Error("gone"));
    await expect(queued).rejects.toThrow("gone");
    expect(queue.queuedCount).toBe(0);
    expect(queue.activeCount).toBe(1);
  });

  it("passes the abort signal through to the active worker", () => {
    const { mint, pending } = deferredMint();
    const queue = new IdentityMintQueue(policy(), mint);
    const controller = new AbortController();

    void queue.submit(8, { signal: controller.signal });
    controller.abort(new Error("gone"));
    expect(pending[0].signal?.aborted).toBe(true);
  });

  it("rejects an already-aborted submission without starting a worker", async () => {
    const { mint } = deferredMint();
    const queue = new IdentityMintQueue(policy(), mint);
    const controller = new AbortController();
    controller.abort(new Error("gone"));

    await expect(queue.submit(8, { signal: controller.signal })).rejects.toThrow("gone");
    expect(mint).not.toHaveBeenCalled();
  });
});

import { Worker } from "node:worker_threads";
import { createIdentityKey, type Identity } from "./identity.js";

// The search runs from source text rather than a worker file, so it works the same from the
// TypeScript sources (tests) and from dist. It must match securityLevelOf in identity.ts.
const SEARCH_SOURCE = `
const { createHash } = require("node:crypto");
const { parentPort, workerData } = require("node:worker_threads");
const { publicKeyBase64, start, level } = workerData;
const levelOf = (offset) => {
  const digest = createHash("sha1").update(publicKeyBase64).update(offset.toString()).digest();
  let zeros = 0;
  for (const byte of digest) {
    if (byte === 0) { zeros += 8; continue; }
    let bit = 0;
    while ((byte & (1 << bit)) === 0) bit++;
    return zeros + bit;
  }
  return zeros;
};
let offset = BigInt(start);
while (levelOf(offset) < level) offset++;
parentPort.postMessage(offset.toString());
`;

export interface IdentitySearchOptions {
  signal?: AbortSignal;
}

/** Raises the offset of `identity` until it reaches `level`, off the main thread. */
export function upgradeIdentity(identity: Identity, level: number, options: IdentitySearchOptions = {}): Promise<Identity> {
  const { signal } = options;
  if (signal?.aborted) return Promise.reject(signal.reason as Error);
  return new Promise((resolve, reject) => {
    const worker = new Worker(SEARCH_SOURCE, {
      eval: true,
      workerData: { publicKeyBase64: identity.publicKeyBase64, start: identity.offset.toString(), level },
    });
    const onAbort = () => {
      void worker.terminate();
      reject(signal!.reason as Error);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    const settle = () => signal?.removeEventListener("abort", onAbort);
    worker.once("message", (offset: string) => {
      settle();
      void worker.terminate();
      resolve(identity.withOffset(BigInt(offset)));
    });
    worker.once("error", (error) => {
      settle();
      reject(error);
    });
    // Covers a worker that ends without an answer. After resolve or reject this is a no-op.
    worker.once("exit", (code) => {
      settle();
      reject(new Error(`identity search worker exited with code ${code}`));
    });
  });
}

/** A new identity at `level`, the offset search off the main thread. */
export function generateIdentityAsync(level: number, options: IdentitySearchOptions = {}): Promise<Identity> {
  return upgradeIdentity(createIdentityKey(), level, options);
}

/** Back-pressure limits for the gateway identity mint endpoint, admin-configurable and persisted. */
export interface IdentityMintPolicy {
  /** Highest security level a mint request may ask for. */
  maxLevel: number;
  /** Mint workers allowed to run at once. */
  concurrency: number;
  /** Waiters allowed to queue once concurrency is reached, beyond which requests are rejected. */
  queueDepth: number;
}

// The default level matches the web client default so a saved identity needs no upgrade to connect.
export const DEFAULT_IDENTITY_MINT_POLICY: IdentityMintPolicy = { maxLevel: 8, concurrency: 2, queueDepth: 20 };

export const IDENTITY_MINT_LEVEL_MIN = 1;
export const IDENTITY_MINT_LEVEL_MAX = 24;
export const IDENTITY_MINT_CONCURRENCY_MIN = 1;
export const IDENTITY_MINT_CONCURRENCY_MAX = 8;
export const IDENTITY_MINT_QUEUE_DEPTH_MIN = 0;
export const IDENTITY_MINT_QUEUE_DEPTH_MAX = 100;

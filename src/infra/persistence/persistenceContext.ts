import type { DatabaseSync } from "node:sqlite";

/** Shared handle every repository receives from `WebSpeakDatabase`. */
export interface PersistenceContext {
  readonly database: DatabaseSync;
  /** Runs action inside BEGIN IMMEDIATE ... COMMIT, no nesting. */
  transaction(action: () => void): void;
}

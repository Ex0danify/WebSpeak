import type { Identity } from "../crypto/identity.js";
import type { KeySwitch } from "../transport/packetProtection.js";
import type { CommandRow } from "../wire/commandRows.js";

/** What either handshake needs to answer the proof of the server. */
export interface ExpandOptions {
  identity: Identity;
  /** The alpha of our clientinitiv. */
  alpha: Uint8Array;
  /** Seed of the ephemeral key, for tests. */
  ephemeralSeed?: Uint8Array;
  /** Replaces the license chain derivation, for the loopback test server whose key has no chain from the root. */
  deriveServerKey?: (license: Buffer) => Buffer;
}

/** The parts in which the TS3 and the TS6 handshake differ, the driver in handshake.ts does the rest. */
export interface HandshakeFlavor {
  /** The server command that carries its proof and opens the key exchange. */
  readonly expandCommand: string;
  /** Adds `a=1` to clientinitiv, which asks the server for the TS6 handshake. A TS3 server ignores it. */
  readonly asksForTs6: boolean;
  /** Keys the Init1 solution switches to, for a handshake whose dummy key changes there. */
  solutionKeys?(): KeySwitch;
  /** Answers the proof: the command to send, still under the dummy key, and the session keys that start after it. */
  accept(row: CommandRow, options: ExpandOptions): { reply: string; keySwitch: KeySwitch };
}

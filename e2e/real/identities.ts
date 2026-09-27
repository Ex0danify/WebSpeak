import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { BrowserContextOptions } from "@playwright/test";
import { generateIdentity, identityFromString } from "@echosixhiya/teamspeak-client";

/**
 * Identities of the real-server tests are seeded, not persisted by a browser profile: the client
 * only restores a stored identity when `webspeak:remember-identity` is "1", and never writes that
 * key unless the checkbox is toggled (finding F1). Seeding the key and the identity gives every
 * browser the identity of a returning user, and the same TeamSpeak UID on every run of the suite,
 * so rights granted to it (step 5.2b) survive.
 */
export interface SeededIdentity {
  index: number;
  /** What the web client stores and sends: `Identity.toString()`. */
  privateMaterial: string;
  /** The unique identifier the TeamSpeak 6 server reports, the key server groups are granted to. */
  uid: string;
}

/**
 * TeamSpeak 6 (6.0.0-beta13.1) identifies a client by the SHA-256 of its base64 public key. The
 * SDK's `getUidFromPublicKey` still returns the SHA-1 form of TeamSpeak 3 (finding F36), so it is
 * not used. Global setup checks this value against what the server reports.
 */
export function serverUidOf(publicKeyBase64: string): string {
  return createHash("sha256").update(publicKeyBase64).digest("base64");
}

const defaultFile = fileURLToPath(new URL("./.identities.json", import.meta.url));

/** The security level the gateway asks for when it makes an identity itself (`ts-client.ts`). */
const SECURITY_LEVEL = 8;

/**
 * Identities 0 to 3 are granted Server Admin by the global setup (step 5.2b); 4 and up are ordinary
 * guests, for the tests that show a refusal.
 */
export const ADMIN_IDENTITIES = 4;
export const GUEST_IDENTITY = ADMIN_IDENTITIES;

export class IdentityStore {
  constructor(private readonly file: string = defaultFile) {}

  private read(): string[] {
    return existsSync(this.file) ? (JSON.parse(readFileSync(this.file, "utf8")) as string[]) : [];
  }

  /** Identity number `index`; made and saved on first use, the same one afterwards. */
  get(index: number): SeededIdentity {
    if (!Number.isInteger(index) || index < 0) throw new Error(`identity index must be a non-negative integer, got ${index}`);
    const stored = this.read();
    let changed = false;
    while (stored.length <= index) {
      stored.push(generateIdentity(SECURITY_LEVEL).toString());
      changed = true;
    }
    if (changed) writeFileSync(this.file, JSON.stringify(stored, null, 2) + "\n", { mode: 0o600 });
    const privateMaterial = stored[index];
    return { index, privateMaterial, uid: serverUidOf(identityFromString(privateMaterial).publicKeyBase64()) };
  }
}

export const identities = new IdentityStore();

type StorageState = Exclude<BrowserContextOptions["storageState"], string | undefined>;

// `indexedDB` is part of Playwright's storage state but missing from its typings (1.63).
interface SeededStorageState extends StorageState {
  origins: (StorageState["origins"][number] & { indexedDB: unknown[] })[];
}

const STORES = ["identities", "preferences", "favorites", "recent"];

/**
 * A Playwright storage state for a browser that has used the site before: remember-identity is on
 * and identity number `index` is in the `webspeak-local` database as the client saves it. The
 * origin is the gateway's, which is only known at run time. All four stores are created, because
 * the client creates them only when the database does not exist yet.
 */
export function storageStateFor(index: number, origin: string, store: IdentityStore = identities): SeededStorageState {
  const { privateMaterial } = store.get(index);
  const now = Date.now();
  return {
    cookies: [],
    origins: [
      {
        origin,
        localStorage: [{ name: "webspeak:remember-identity", value: "1" }],
        indexedDB: [
          {
            name: "webspeak-local",
            version: 1,
            stores: STORES.map((name) => ({
              name,
              keyPath: "id",
              autoIncrement: false,
              indexes: [],
              records: name === "identities" ? [{ value: { id: "current", label: `test identity ${index}`, privateMaterial, createdAt: now, lastUsedAt: now } }] : [],
            })),
          },
        ],
      },
    ],
  };
}

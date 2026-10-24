import { verifyEd25519 } from "../crypto/edwards.js";
import { deriveLicenseKey, parseLicenseChain } from "../crypto/licenseChain.js";
import { DUMMY_PACKET_KEY_256, Ts6PacketKeys, ts6Secrets } from "../crypto/packetKeys.js";
import { createX25519Key, x25519SharedSecret } from "../crypto/x25519.js";
import { HandshakeError } from "../errors/teamSpeakErrors.js";
import { FixedPacketKeys, type KeySwitch } from "../transport/packetProtection.js";
import type { CommandRow } from "../wire/commandRows.js";
import { buildCommand } from "../wire/commandText.js";
import { parseU64 } from "../wire/commandValues.js";
import type { ExpandOptions, HandshakeFlavor } from "./handshakeFlavor.js";

// initivxalpha → clientivxalpha: the server proves its identity over its ephemeral key and the time,
// both sides run X25519 and derive the connection keys from the shared secret and the handshake nonces.

const BETA_BYTES = 32;
const EPSILON_BYTES = 32;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export interface Ts6ExpandResult {
  /** The `clientivxalpha` command text, still sent under the dummy key. */
  clientivxalpha: string;
  /** Session keys, they start with the command after `clientivxalpha`. */
  keySwitch: KeySwitch;
  /** The connection IV, for tests that act as the server. */
  sharedIv: Buffer;
}

const fail = (reason: string, cause?: unknown) => new HandshakeError("initivxalpha", reason, cause === undefined ? undefined : { cause });

function base64Field(row: CommandRow, key: string): Buffer {
  const text = row[key];
  if (text === undefined || text === "" || !BASE64.test(text)) throw fail(`${key} is missing or not base64`);
  return Buffer.from(text, "base64");
}

/** Signed by the server (Ed25519) and by the client (P-256): `epsilon ‖ u64be(time)`. */
export function ts6ProofData(epsilon: Uint8Array, time: bigint): Buffer {
  const encodedTime = Buffer.alloc(8);
  encodedTime.writeBigUInt64BE(time);
  return Buffer.concat([epsilon, encodedTime]);
}

export function acceptInitivxalpha(row: CommandRow, options: ExpandOptions): Ts6ExpandResult {
  const license = base64Field(row, "l");
  const beta = base64Field(row, "beta");
  const serverEpsilon = base64Field(row, "epsilon");
  const proof = base64Field(row, "proof");
  if (beta.length !== BETA_BYTES) throw fail(`beta must be ${BETA_BYTES} bytes, got ${beta.length}`);
  if (serverEpsilon.length !== EPSILON_BYTES) throw fail(`epsilon must be ${EPSILON_BYTES} bytes, got ${serverEpsilon.length}`);
  const time = parseU64(row.time);
  if (time === undefined) throw fail("time is missing or not a number");

  let serverKey: Buffer;
  try {
    serverKey = options.deriveServerKey ? options.deriveServerKey(license) : deriveLicenseKey(parseLicenseChain(license));
  } catch (error) {
    if (error instanceof HandshakeError) throw error;
    throw fail("the license key cannot be derived", error);
  }
  if (!verifyEd25519(serverKey, ts6ProofData(serverEpsilon, time), proof)) throw fail("the server proof does not match");

  const ephemeral = createX25519Key(options.ephemeralSeed);
  const ecdh = x25519SharedSecret(ephemeral.privateKey, serverEpsilon);
  const { sharedIv, fakeMac } = ts6Secrets(ecdh, options.alpha, beta);
  const clientivxalpha = buildCommand("clientivxalpha", [
    ["epsilon", ephemeral.publicKey.toString("base64")],
    ["proof", options.identity.sign(ts6ProofData(ephemeral.publicKey, time)).toString("base64")],
    ["time", time.toString()],
  ]);
  return { clientivxalpha, keySwitch: { keys: new Ts6PacketKeys(sharedIv), fakeMac }, sharedIv };
}

export const ts6Handshake: HandshakeFlavor = {
  expandCommand: "initivxalpha",
  asksForTs6: true,
  // The Init1 solution carries the clientinitiv, from there the dummy key is 256-bit.
  solutionKeys: () => ({ keys: new FixedPacketKeys(DUMMY_PACKET_KEY_256) }),
  accept(row, options) {
    const { clientivxalpha, keySwitch } = acceptInitivxalpha(row, options);
    return { reply: clientivxalpha, keySwitch };
  },
};

import { createEphemeralKey, ts3SharedSecret } from "../crypto/edwards.js";
import { importTsPublicKey, verifyTsSignature } from "../crypto/identity.js";
import { deriveLicenseKey, parseLicenseChain } from "../crypto/licenseChain.js";
import { deriveIvStruct, Ts3PacketKeys, ts3FakeMac } from "../crypto/packetKeys.js";
import { HandshakeError } from "../errors/teamSpeakErrors.js";
import type { KeySwitch } from "../transport/packetProtection.js";
import type { CommandRow } from "../wire/commandRows.js";
import { buildCommand } from "../wire/commandText.js";
import type { ExpandOptions, HandshakeFlavor } from "./handshakeFlavor.js";

// initivexpand2 → clientek: the server proves its identity over the license chain, both sides
// derive the Ed25519 shared secret from the license key and the client's ephemeral key.

const BETA_BYTES = 54;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export interface Ts3ExpandResult {
  /** The `clientek` command text, sealed with the dummy key. */
  clientek: string;
  /** Session keys, they start with the command after `clientek`. */
  keySwitch: KeySwitch;
  /** ivStruct of the key schedule, for tests that act as the server. */
  ivStruct: Buffer;
}

const fail = (reason: string, cause?: unknown) => new HandshakeError("initivexpand2", reason, cause === undefined ? undefined : { cause });

function base64Field(row: CommandRow, key: string): Buffer {
  const text = row[key];
  if (text === undefined || text === "" || !BASE64.test(text)) throw fail(`${key} is missing or not base64`);
  return Buffer.from(text, "base64");
}

/** Signed by the identity: `ek ‖ beta`. */
export function clientEkProofData(ek: Uint8Array, beta: Uint8Array): Buffer {
  return Buffer.concat([ek, beta]);
}

export function acceptInitivexpand2(row: CommandRow, options: ExpandOptions): Ts3ExpandResult {
  const license = base64Field(row, "l");
  const beta = base64Field(row, "beta");
  const proof = base64Field(row, "proof");
  if (beta.length !== BETA_BYTES) throw fail(`beta must be ${BETA_BYTES} bytes, got ${beta.length}`);
  const serverKey = importTsPublicKey(row.omega ?? "");
  if (!serverKey) throw fail("omega is not a P-256 key");
  if (!verifyTsSignature(serverKey, license, proof)) throw fail("the server proof does not match the license");

  let licenseKey: Buffer;
  try {
    licenseKey = options.deriveServerKey ? options.deriveServerKey(license) : deriveLicenseKey(parseLicenseChain(license));
  } catch (error) {
    if (error instanceof HandshakeError) throw error;
    throw fail("the license key cannot be derived", error);
  }

  const ephemeral = createEphemeralKey(options.ephemeralSeed);
  let shared: Buffer;
  try {
    shared = ts3SharedSecret(licenseKey, ephemeral.privateKey);
  } catch (error) {
    throw fail("the license key is not a point", error);
  }
  const ivStruct = deriveIvStruct(options.alpha, beta, shared);
  const clientek = buildCommand("clientek", [
    ["ek", ephemeral.publicKey.toString("base64")],
    ["proof", options.identity.sign(clientEkProofData(ephemeral.publicKey, beta)).toString("base64")],
  ]);
  return { clientek, keySwitch: { keys: new Ts3PacketKeys(ivStruct), fakeMac: ts3FakeMac(ivStruct) }, ivStruct };
}

export const ts3Handshake: HandshakeFlavor = {
  expandCommand: "initivexpand2",
  asksForTs6: false,
  accept(row, options) {
    const { clientek, keySwitch } = acceptInitivexpand2(row, options);
    return { reply: clientek, keySwitch };
  },
};

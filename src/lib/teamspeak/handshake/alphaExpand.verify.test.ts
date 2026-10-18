import { generateKeyPairSync, sign as edSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fixtureFile, hasFixture } from "../../../../test/support/tsCaptureFixtures.js";
import { generateIdentity, importTsPublicKey, verifyTsSignature } from "../crypto/identity.js";
import { alphaSecrets } from "../crypto/packetKeys.js";
import { createX25519Key, x25519SharedSecret } from "../crypto/x25519.js";
import { HandshakeError } from "../errors/teamSpeakErrors.js";
import type { CommandRow } from "../wire/commandRows.js";
import { parseCommand } from "../wire/commandText.js";
import { acceptInitivxalpha, alphaProofData } from "./alphaExpand.js";

const client = generateIdentity(0);
const serverEd = generateKeyPairSync("ed25519");
const serverEdPublic = Buffer.from((serverEd.publicKey.export({ format: "jwk" }) as { x: string }).x, "base64url");
const serverKey = createX25519Key(Buffer.alloc(32, 7));
const alpha = Buffer.alloc(10, 0xa1);
const beta = Buffer.alloc(32, 0xbe);
const time = 1_792_363_696n;

function expandRow(overrides: Record<string, string> = {}): CommandRow {
  return {
    l: "AQACAw==", // decoded bytes do not matter, deriveServerKey replaces the chain
    beta: beta.toString("base64"),
    omega: "",
    ot: "1",
    tvd: "",
    time: time.toString(),
    epsilon: serverKey.publicKey.toString("base64"),
    proof: edSign(null, alphaProofData(serverKey.publicKey, time), serverEd.privateKey).toString("base64"),
    ...overrides,
  };
}

const withSeam = { identity: client, alpha, deriveServerKey: () => serverEdPublic };

describe("initivxalpha", () => {
  it("derives the same sharedIv as the server and proves the ephemeral key", () => {
    const result = acceptInitivxalpha(expandRow(), { ...withSeam, ephemeralSeed: Buffer.alloc(32, 3) });
    const command = parseCommand(result.clientivxalpha);
    expect(command.name).toBe("clientivxalpha");
    const clientEpsilon = Buffer.from(command.rows[0].epsilon, "base64");
    expect(clientEpsilon).toEqual(createX25519Key(Buffer.alloc(32, 3)).publicKey);
    expect(command.rows[0].time).toBe(time.toString());
    const proof = Buffer.from(command.rows[0].proof, "base64");
    expect(verifyTsSignature(importTsPublicKey(client.publicKeyBase64)!, alphaProofData(clientEpsilon, time), proof)).toBe(true);
    const ecdh = x25519SharedSecret(serverKey.privateKey, clientEpsilon);
    expect(result.sharedIv).toEqual(alphaSecrets(ecdh, alpha, beta).sharedIv);
    expect(result.keySwitch.fakeMac).toEqual(alphaSecrets(ecdh, alpha, beta).fakeMac);
  });

  it("refuses missing or malformed fields", () => {
    const cases: [Record<string, string>, RegExp][] = [
      [{ l: "" }, /l is missing/],
      [{ beta: "not base64!" }, /beta is missing or not base64/],
      [{ epsilon: "abc" }, /epsilon is missing or not base64/],
      [{ proof: "" }, /proof is missing/],
      [{ beta: Buffer.alloc(54).toString("base64") }, /beta must be 32 bytes, got 54/],
      [{ epsilon: Buffer.alloc(16).toString("base64") }, /epsilon must be 32 bytes, got 16/],
      [{ time: "" }, /time is missing or not a number/],
      [{ proof: edSign(null, Buffer.from("other"), serverEd.privateKey).toString("base64") }, /server proof does not match/],
    ];
    for (const [overrides, message] of cases) {
      const run = () => acceptInitivxalpha(expandRow(overrides), withSeam);
      expect(run).toThrow(HandshakeError);
      expect(run).toThrow(message);
    }
  });

  it("wraps a failing license derivation but keeps handshake errors", () => {
    const thrown = (() => {
      try {
        acceptInitivxalpha(expandRow(), {
          identity: client,
          alpha,
          deriveServerKey: () => {
            throw new RangeError("boom");
          },
        });
      } catch (error) {
        return error as HandshakeError;
      }
    })();
    expect(thrown).toMatchObject({ step: "initivxalpha", cause: expect.any(RangeError) });
  });
});

describe.skipIf(!hasFixture("handshakeVectors.json"))("initivxalpha against the recorded server answer", () => {
  it("accepts the real proof and license chain and derives a 64-byte sharedIv", () => {
    const row = (
      JSON.parse(readFileSync(fixtureFile("handshakeVectors.json")!, "utf8")) as { alpha: { initivxalpha: CommandRow } }
    ).alpha.initivxalpha;
    const result = acceptInitivxalpha(row, { identity: client, alpha });
    expect(parseCommand(result.clientivxalpha).name).toBe("clientivxalpha");
    expect(result.sharedIv).toHaveLength(64);
  });
});

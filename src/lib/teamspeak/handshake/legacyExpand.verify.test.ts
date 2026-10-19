import { describe, expect, it } from "vitest";
import { FIXTURES, hasCaptures, loadCapture } from "../../../../test/support/tsCaptureFixtures.js";
import { createEphemeralKey, legacySharedSecret } from "../crypto/edwards.js";
import { generateIdentity, importTsPublicKey, verifyTsSignature } from "../crypto/identity.js";
import { deriveIvStruct } from "../crypto/packetKeys.js";
import { HandshakeError } from "../errors/teamSpeakErrors.js";
import type { CommandRow } from "../wire/commandRows.js";
import { parseCommand } from "../wire/commandText.js";
import { acceptInitivexpand2, clientEkProofData } from "./legacyExpand.js";

const client = generateIdentity(0);
const server = generateIdentity(0);
const serverEd = createEphemeralKey(Buffer.alloc(32, 9));
const alpha = Buffer.alloc(10, 0xa1);
const beta = Buffer.alloc(54, 0xbe);
const license = Buffer.from("01000102", "hex");

function expandRow(overrides: Record<string, string> = {}): CommandRow {
  return {
    l: license.toString("base64"),
    beta: beta.toString("base64"),
    omega: server.publicKeyBase64,
    ot: "1",
    proof: server.sign(license).toString("base64"),
    tvd: "",
    time: "1792222195",
    ...overrides,
  };
}

const withSeam = { identity: client, alpha, deriveServerKey: () => serverEd.publicKey };

describe("initivexpand2", () => {
  it("derives the same ivStruct as the server and proves the ephemeral key", () => {
    const result = acceptInitivexpand2(expandRow(), { ...withSeam, ephemeralSeed: Buffer.alloc(32, 3) });
    const clientek = parseCommand(result.clientek);
    expect(clientek.name).toBe("clientek");
    const ek = Buffer.from(clientek.rows[0].ek, "base64");
    expect(ek).toEqual(createEphemeralKey(Buffer.alloc(32, 3)).publicKey);
    const proof = Buffer.from(clientek.rows[0].proof, "base64");
    expect(verifyTsSignature(importTsPublicKey(client.publicKeyBase64)!, clientEkProofData(ek, beta), proof)).toBe(true);
    expect(result.ivStruct).toEqual(deriveIvStruct(alpha, beta, legacySharedSecret(ek, serverEd.privateKey)));
    expect(result.keySwitch.fakeMac).toHaveLength(8);
  });

  it("refuses missing or malformed fields", () => {
    const cases: [Record<string, string>, RegExp][] = [
      [{ l: "" }, /l is missing/],
      [{ beta: "not base64!" }, /beta is missing or not base64/],
      [{ proof: "abc" }, /proof is missing or not base64/],
      [{ beta: Buffer.alloc(32).toString("base64") }, /beta must be 54 bytes, got 32/],
      [{ omega: "AAAA" }, /omega is not a P-256 key/],
      [{ proof: server.sign(Buffer.from("other")).toString("base64") }, /server proof does not match/],
    ];
    for (const [overrides, message] of cases) {
      const run = () => acceptInitivexpand2(expandRow(overrides), withSeam);
      expect(run).toThrow(HandshakeError);
      expect(run).toThrow(message);
    }
    const { omega: _omega, ...withoutOmega } = expandRow();
    expect(() => acceptInitivexpand2(withoutOmega, withSeam)).toThrow(/omega/);
  });

  it("keeps license errors as they are and wraps everything else", () => {
    expect(() => acceptInitivexpand2(expandRow(), { identity: client, alpha })).toThrow(expect.objectContaining({ step: "license" }));
    const thrown = (() => {
      try {
        acceptInitivexpand2(expandRow(), {
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
    expect(thrown).toMatchObject({ step: "initivexpand2", cause: expect.any(RangeError) });
    expect(() => acceptInitivexpand2(expandRow(), { ...withSeam, deriveServerKey: () => Buffer.alloc(32, 0xff) })).toThrow(/not a point/);
  });
});

describe.skipIf(!hasCaptures)("initivexpand2 against the TS3 capture", () => {
  it("accepts the real server's proof and license chain", () => {
    const text = loadCapture(FIXTURES.ts3Packets)
      .packets.filter((packet) => packet.direction === "s2c" && packet.plain)
      .map((packet) => packet.plain!.toString())
      .find((plain) => plain.startsWith("initivexpand2 "));
    const result = acceptInitivexpand2(parseCommand(text!).rows[0], { identity: client, alpha });
    expect(parseCommand(result.clientek).name).toBe("clientek");
    expect(result.ivStruct).toHaveLength(64);
  });
});

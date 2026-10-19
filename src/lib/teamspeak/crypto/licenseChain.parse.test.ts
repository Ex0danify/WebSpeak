import { ed25519 } from "@noble/curves/ed25519.js";
import { parseLicenses as sdkParseLicenses } from "@echosixhiya/teamspeak-client/handshake";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FIXTURES, fixtureFile, hasFixture } from "../../../../test/support/tsCaptureFixtures.js";
import { HandshakeError } from "../errors/teamSpeakErrors.js";
import { verifyEd25519 } from "./edwards.js";
import { deriveLicenseKey, LicenseBlockType, parseLicenseChain } from "./licenseChain.js";

const key = (factor: bigint) => Buffer.from(ed25519.Point.BASE.multiply(factor).toBytes());

function block(type: number, payload: number[], { before = 100, after = 200, blockKey = key(7n) } = {}): Buffer {
  const header = Buffer.alloc(42);
  blockKey.copy(header, 1);
  header[33] = type;
  header.writeUInt32BE(before, 34);
  header.writeUInt32BE(after, 38);
  return Buffer.concat([header, Buffer.from(payload)]);
}

const text = (value: string) => [...Buffer.from(value), 0];
const chain = (...blocks: Buffer[]) => Buffer.concat([Buffer.from([1]), ...blocks]);

const sample = chain(
  block(LicenseBlockType.intermediate, [9, 9, 9, 9, ...text("Root CA")], { blockKey: key(3n) }),
  block(LicenseBlockType.ts5Server, [5, 2, 3, 1, 2, 3, 0], { blockKey: key(5n) }),
  block(LicenseBlockType.server, [1, 0, 0, 0, 0, ...text("Anonymous")], { blockKey: key(11n) }),
  block(LicenseBlockType.ephemeral, [], { blockKey: key(13n) }),
);

describe("parseLicenseChain", () => {
  it("reads every block type with its fields", () => {
    const blocks = parseLicenseChain(sample);
    expect(blocks.map((entry) => entry.type)).toEqual([0, 8, 2, 32]);
    expect(blocks[0].issuer).toBe("Root CA");
    expect(blocks[1].serverType).toBe(5);
    expect(blocks[1].properties).toEqual([Buffer.from([1, 2, 3]), Buffer.alloc(0)]);
    expect(blocks[2]).toMatchObject({ serverType: 1, issuer: "Anonymous" });
    expect(blocks[3].key.equals(key(13n))).toBe(true);
    expect(blocks[0].notValidBefore.toISOString()).toBe("2013-01-01T00:01:40.000Z");
  });

  it("counts the issuer in bytes, not characters", () => {
    const blocks = parseLicenseChain(chain(block(0, [0, 0, 0, 0, 0xc3, 0xa9, 0]), block(32, [])));
    expect(blocks[0].issuer).toBe("é");
    expect(blocks).toHaveLength(2);
  });

  it("rejects malformed licenses with a HandshakeError", () => {
    const bad = [
      Buffer.alloc(0),
      Buffer.from([2]),
      Buffer.from([1]),
      chain(block(32, []).subarray(0, 41)),
      chain(Buffer.concat([Buffer.from([1]), block(32, []).subarray(1)])),
      chain(block(32, [], { before: 200, after: 100 })),
      chain(block(7, [])),
      chain(block(0, [0, 0, 0, 0, 65, 66])),
      chain(block(2, [1, 0, 0, 0])),
      chain(block(8, [1])),
      chain(block(8, [1, 1])),
      chain(block(8, [1, 1, 4, 1])),
      chain(...Array.from({ length: 17 }, () => block(32, []))),
    ];
    for (const license of bad) expect(() => parseLicenseChain(license), license.toString("hex")).toThrow(HandshakeError);
  });
});

describe("deriveLicenseKey", () => {
  // Parity with the pinned SDK, removed together with the SDK.
  it("derives the same key as the SDK", () => {
    expect(deriveLicenseKey(parseLicenseChain(sample)).equals(Buffer.from(sdkParseLicenses(sample).deriveKey()))).toBe(true);
  });

  it("fails with a HandshakeError on a block key that is not a point", () => {
    const notAPoint = Buffer.alloc(32, 0xff);
    expect(() => deriveLicenseKey(parseLicenseChain(chain(block(32, [], { blockKey: notAPoint }))))).toThrow(HandshakeError);
  });
});

// Capture fixtures stay local, CI skips these tests.
const hasFixtures = hasFixture(FIXTURES.handshakeVectors);

describe.skipIf(!hasFixtures)("license chains against the captures", () => {
  const vectors = () =>
    JSON.parse(readFileSync(fixtureFile(FIXTURES.handshakeVectors)!, "utf8")) as {
      legacy: { initivexpand2: { l: string }; licenseBlockTypes: number[]; derivedKeyHex: string };
      alpha: {
        initivxalpha: { l: string; epsilon: string; time: string; proof: string };
        licenseBlockTypes: number[];
        derivedKeyHex: string;
      };
    };

  it("derives the server keys of the TS3 and the TS6 session", () => {
    const { legacy, alpha } = vectors();
    for (const [license, types, derived] of [
      [legacy.initivexpand2.l, legacy.licenseBlockTypes, legacy.derivedKeyHex],
      [alpha.initivxalpha.l, alpha.licenseBlockTypes, alpha.derivedKeyHex],
    ] as const) {
      const blocks = parseLicenseChain(Buffer.from(license, "base64"));
      expect(blocks.map((entry) => entry.type)).toEqual(types);
      expect(deriveLicenseKey(blocks).toString("hex")).toBe(derived);
    }
  });

  it("verifies the TS6 server's Ed25519 proof over epsilon and time", () => {
    const { initivxalpha } = vectors().alpha;
    const serverKey = deriveLicenseKey(parseLicenseChain(Buffer.from(initivxalpha.l, "base64")));
    const time = Buffer.alloc(8);
    time.writeBigUInt64BE(BigInt(initivxalpha.time));
    const signed = Buffer.concat([Buffer.from(initivxalpha.epsilon, "base64"), time]);
    expect(verifyEd25519(serverKey, signed, Buffer.from(initivxalpha.proof, "base64"))).toBe(true);
    time[7] ^= 1;
    expect(
      verifyEd25519(
        serverKey,
        Buffer.concat([Buffer.from(initivxalpha.epsilon, "base64"), time]),
        Buffer.from(initivxalpha.proof, "base64"),
      ),
    ).toBe(false);
  });
});

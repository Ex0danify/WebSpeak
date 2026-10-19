import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FIXTURES, fixtureFile, hasFixture } from "../../../../test/support/tsCaptureFixtures.js";
import { AlphaPacketKeys, alphaSecrets, deriveIvStruct, LegacyPacketKeys } from "./packetKeys.js";

const hasFixtures = hasFixture(FIXTURES.handshakeVectors);

const ivStruct = Buffer.from("0102030405060708090a0b0c0d0e0f10111213141516171819", "hex");

describe("LegacyPacketKeys", () => {
  it("hashes direction, type, generation and ivStruct and XORs the packet id into the key", () => {
    const hash = createHash("sha256")
      .update(Buffer.concat([Buffer.from([0x31, 0x02, 0, 0, 0, 7]), ivStruct]))
      .digest();
    const { key, nonce } = new LegacyPacketKeys(ivStruct).keyFor("c2s", 2, 7, 0x1234);
    expect(nonce.equals(hash.subarray(16, 32))).toBe(true);
    expect(key[0]).toBe(hash[0] ^ 0x12);
    expect(key[1]).toBe(hash[1] ^ 0x34);
    expect(key.subarray(2).equals(hash.subarray(2, 16))).toBe(true);
  });

  it("does not let the id XOR of one packet leak into the cached base key", () => {
    const keys = new LegacyPacketKeys(ivStruct);
    const first = keys.keyFor("s2c", 2, 0, 0xffff).key;
    expect(keys.keyFor("s2c", 2, 0, 0xffff).key.equals(first)).toBe(true);
    expect(keys.keyFor("s2c", 2, 0, 0).key.equals(first)).toBe(false);
  });

  it("separates directions, types and generations, also after the cache was cleared", () => {
    const keys = new LegacyPacketKeys(ivStruct);
    const seen = new Set<string>();
    for (const direction of ["c2s", "s2c"] as const) {
      for (let type = 0; type < 8; type++) {
        for (let generation = 0; generation < 5; generation++) seen.add(keys.keyFor(direction, type, generation, 1).key.toString("hex"));
      }
    }
    expect(seen.size).toBe(80);
    expect(keys.keyFor("c2s", 0, 0, 1).key.toString("hex")).toBe([...seen][0]);
  });
});

describe("deriveIvStruct", () => {
  it("rejects an alpha that is not 10 bytes and a secret shorter than alpha and beta", () => {
    expect(() => deriveIvStruct(Buffer.alloc(9), Buffer.alloc(54), Buffer.alloc(64))).toThrow(RangeError);
    expect(() => deriveIvStruct(Buffer.alloc(10), Buffer.alloc(55), Buffer.alloc(64))).toThrow(RangeError);
  });
});

describe("AlphaPacketKeys", () => {
  const sharedIv = randomBytes(64);

  it("hashes direction, type, generation and sharedIv with SHA-512 and XORs the packet id into the key", () => {
    const hash = createHash("sha512")
      .update(Buffer.concat([Buffer.from([0x30, 0x08, 0, 0, 0, 0]), sharedIv]))
      .digest();
    const { key, nonce } = new AlphaPacketKeys(sharedIv).keyFor("s2c", 8, 0, 0xabcd);
    expect(key.length).toBe(32);
    expect(nonce.equals(hash.subarray(32, 64))).toBe(true);
    expect(key[0]).toBe(hash[0] ^ 0xab);
    expect(key[1]).toBe(hash[1] ^ 0xcd);
    expect(key.subarray(2).equals(hash.subarray(2, 32))).toBe(true);
  });

  describe.skipIf(!hasFixture(FIXTURES.alphaSchedule))("against the recorded schedule", () => {
    const entries = () =>
      (
        JSON.parse(readFileSync(fixtureFile(FIXTURES.alphaSchedule)!, "utf8")) as {
          entries: { output: string; direction: "c2s" | "s2c"; packetType: number; generation: number; sharedIV: string }[];
        }
      ).entries;

    it("derives the key and nonce of every recorded packet", () => {
      for (const entry of entries()) {
        const keys = new AlphaPacketKeys(Buffer.from(entry.sharedIV, "hex"));
        const { key, nonce } = keys.keyFor(entry.direction, entry.packetType, entry.generation, 0);
        const out = Buffer.from(entry.output, "hex");
        expect(key.equals(out.subarray(0, 32))).toBe(true);
        expect(nonce.equals(out.subarray(32, 64))).toBe(true);
      }
    });
  });
});

describe("alphaSecrets", () => {
  it("is deterministic and mixes each input", () => {
    const ecdh = randomBytes(32);
    const alpha = randomBytes(10);
    const beta = randomBytes(32);
    const base = alphaSecrets(ecdh, alpha, beta);
    expect(base.sharedIv.length).toBe(64);
    expect(base.fakeMac.length).toBe(8);
    expect(alphaSecrets(ecdh, alpha, beta).sharedIv.equals(base.sharedIv)).toBe(true);
    expect(alphaSecrets(randomBytes(32), alpha, beta).sharedIv.equals(base.sharedIv)).toBe(false);
    expect(alphaSecrets(ecdh, randomBytes(10), beta).sharedIv.equals(base.sharedIv)).toBe(false);
    expect(alphaSecrets(ecdh, alpha, randomBytes(32)).sharedIv.equals(base.sharedIv)).toBe(false);
    expect(alphaSecrets(ecdh, alpha, randomBytes(32)).fakeMac.equals(base.fakeMac)).toBe(false);
  });

  describe.skipIf(!hasFixtures)("against the recorded vector", () => {
    const vector = () =>
      (
        JSON.parse(readFileSync(fixtureFile(FIXTURES.handshakeVectors)!, "utf8")) as {
          alpha: { sharedIvVector?: { ecdh: string; alpha: string; beta: string; sharedIV: string; fakeMac: string } };
        }
      ).alpha.sharedIvVector;

    it.skipIf(!vector())("reproduces the sharedIv and fake MAC", () => {
      const v = vector()!;
      const { sharedIv, fakeMac } = alphaSecrets(Buffer.from(v.ecdh, "hex"), Buffer.from(v.alpha, "hex"), Buffer.from(v.beta, "hex"));
      expect(sharedIv.toString("hex")).toBe(v.sharedIV);
      expect(fakeMac.toString("hex")).toBe(v.fakeMac);
    });
  });
});

import { Crypt, identityFromString as sdkIdentityFromString } from "@echosixhiya/teamspeak-client/crypto";
import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TeamSpeakTransportError } from "../errors/teamSpeakErrors.js";
import { alphaPacketKeys, deriveIvStruct, LegacyPacketKeys, legacyFakeMac } from "./packetKeys.js";

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

  // Parity with the pinned SDK, removed together with the SDK.
  it("derives the same keys as the SDK", () => {
    const crypt = new Crypt(sdkIdentityFromString(`${randomBytes(32).toString("base64")}:0`));
    const alpha = randomBytes(10);
    const beta = randomBytes(54);
    const shared = randomBytes(64);
    crypt.setSharedSecret(alpha, beta, shared);
    const iv = deriveIvStruct(alpha, beta, shared);
    expect(iv.equals(Buffer.from(crypt.ivStruct))).toBe(true);
    expect(legacyFakeMac(iv).equals(Buffer.from(crypt.fakeSignature))).toBe(true);
    const keys = new LegacyPacketKeys(iv);
    for (const [fromServer, type, generation, id] of [
      [false, 2, 0, 1],
      [true, 2, 0, 65535],
      [true, 0, 3, 777],
      [false, 6, 1, 0x0100],
    ] as const) {
      const [sdkKey, sdkNonce] = crypt.getKeyNonce(fromServer, id, generation, type, false);
      const ours = keys.keyFor(fromServer ? "s2c" : "c2s", type, generation, id);
      expect(ours.key.equals(Buffer.from(sdkKey))).toBe(true);
      expect(ours.nonce.equals(Buffer.from(sdkNonce))).toBe(true);
    }
  });
});

describe("deriveIvStruct", () => {
  it("rejects an alpha that is not 10 bytes and a secret shorter than alpha and beta", () => {
    expect(() => deriveIvStruct(Buffer.alloc(9), Buffer.alloc(54), Buffer.alloc(64))).toThrow(RangeError);
    expect(() => deriveIvStruct(Buffer.alloc(10), Buffer.alloc(55), Buffer.alloc(64))).toThrow(RangeError);
  });
});

describe("alphaPacketKeys", () => {
  it("is not implemented yet", () => {
    expect(() => alphaPacketKeys(Buffer.alloc(64))).toThrow(TeamSpeakTransportError);
  });
});

import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InvalidIdentityError } from "../errors/teamSpeakErrors.js";
import {
  findOffset,
  generateIdentity,
  Identity,
  identityFromString,
  importTsPublicKey,
  securityLevelOf,
  verifyTsSignature,
  zeroBitsOf,
} from "./identity.js";
import { ts3Uid, ts6Uid } from "./uid.js";

// The order n of P-256; d must be in [1, n).
const P256_ORDER = Buffer.from("ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551", "hex");

describe("identityFromString", () => {
  it("round-trips a generated identity through its string form", () => {
    const text = generateIdentity(8).toString();
    expect(identityFromString(text).toString()).toBe(text);
  });

  it("pads a short private key at the front", () => {
    const short = `${randomBytes(30).toString("base64")}:5`;
    expect(identityFromString(short).toString()).toMatch(/^AA/);
  });

  it("keeps offsets beyond 64 bits", () => {
    const text = `${randomBytes(32).toString("base64")}:340282366920938463463374607431768211456`;
    expect(identityFromString(text).toString()).toBe(text);
  });

  it("rejects strings the gateway must not turn into a key", () => {
    const d = randomBytes(32).toString("base64");
    for (const bad of [
      d,
      `${d}:`,
      `${d}:-1`,
      `${d}:0x10`,
      `${d}: 1`,
      `${d}:${"9".repeat(41)}`,
      `not base64!:1`,
      `${randomBytes(33).toString("base64")}:1`,
      `${Buffer.alloc(32).toString("base64")}:1`,
      `${P256_ORDER.toString("base64")}:1`,
    ]) {
      expect(() => identityFromString(bad), bad).toThrow(InvalidIdentityError);
    }
  });
});

describe("Identity", () => {
  it("rejects a scalar of the wrong length and a negative offset", () => {
    expect(() => new Identity(Buffer.alloc(31, 1), 0n)).toThrow(InvalidIdentityError);
    expect(() => new Identity(randomBytes(32), -1n)).toThrow(InvalidIdentityError);
  });

  it("keeps the key when the offset changes", () => {
    const identity = generateIdentity(0);
    const moved = identity.withOffset(42n);
    expect(moved.publicKeyBase64).toBe(identity.publicKeyBase64);
    expect(moved.toString()).toMatch(/:42$/);
  });

  it("signs so that the public key in omega form verifies it", () => {
    const identity = generateIdentity(0);
    const data = randomBytes(86);
    const signature = identity.sign(data);
    const publicKey = importTsPublicKey(identity.publicKeyBase64)!;
    expect(verifyTsSignature(publicKey, data, signature)).toBe(true);
    expect(verifyTsSignature(publicKey, randomBytes(86), signature)).toBe(false);
    expect(verifyTsSignature(publicKey, data, Buffer.from("garbage"))).toBe(false);
    expect(verifyTsSignature(publicKey, data, Buffer.alloc(0))).toBe(false);
  });
});

describe("security level", () => {
  it("reaches the requested level at the lowest offset", () => {
    const identity = generateIdentity(8);
    expect(identity.securityLevel()).toBeGreaterThanOrEqual(8);
    for (let offset = 0n; offset < identity.offset; offset++) expect(securityLevelOf(identity.publicKeyBase64, offset)).toBeLessThan(8);
    expect(findOffset(identity.publicKeyBase64, identity.offset, 8)).toBe(identity.offset);
  });

  it("counts zero bits from the low end of each byte", () => {
    const omega = generateIdentity(0).publicKeyBase64;
    const digestOf = (offset: bigint) => createHash("sha1").update(omega).update(offset.toString()).digest();
    let offset = 0n;
    while (digestOf(offset)[0] !== 0x80) offset++;
    expect(securityLevelOf(omega, offset)).toBe(7);
    while (digestOf(offset)[0] !== 0x00 || (digestOf(offset)[1] & 1) === 0) offset++;
    expect(securityLevelOf(omega, offset)).toBe(8);
    expect(zeroBitsOf(Buffer.alloc(20))).toBe(160);
  });
});

describe("importTsPublicKey", () => {
  it("returns undefined for text that is not a key on the curve", () => {
    expect(importTsPublicKey("not base64!")).toBeUndefined();
    expect(importTsPublicKey(Buffer.from([0x30, 0x00]).toString("base64"))).toBeUndefined();
    const offCurve = Buffer.from(generateIdentity(0).publicKeyBase64, "base64");
    offCurve[offCurve.length - 1] ^= 1;
    expect(importTsPublicKey(offCurve.toString("base64"))).toBeUndefined();
  });
});

describe("uids", () => {
  it("reproduces the UIDs a TeamSpeak 6 server reported for a known public key", () => {
    // Measured on teamspeak6-server 6.0.0-beta13.1, see test/identities.test.ts.
    const publicKey = "ME0DAgcAAgEgAiEAht8kWseAlIxVe0M9FD3buO6Dt3wn1tKDlmcP81X0vQ0CIQCoeJwd6WkaZ40RT/vKF3J/t6PRmKmEUyPwqg9qvnrG0Q==";
    expect(ts6Uid(publicKey)).toBe("5xNaN5EbsO/Ccg929pS4u2awXacScXRizfuG/oSlNX8=");
    expect(ts3Uid(publicKey)).toBe("jLjx5pIMJszva8Z6CM51YeSQyNI=");
  });
});

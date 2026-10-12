import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./secretCrypto.js";

const key = Buffer.alloc(32, 7);
const otherKey = Buffer.alloc(32, 8);

function parts(payload: string): string[] {
  return payload.split(":");
}

describe("encryptSecret / decryptSecret", () => {
  it("round trips text, including non-ASCII and separators", () => {
    for (const value of ["hunter2", "pässwörd ✓", "a:b:c", "x".repeat(10_000)]) {
      expect(decryptSecret(encryptSecret(value, key), key)).toBe(value);
    }
  });

  it("stores the empty string as the empty string and reads it back", () => {
    expect(encryptSecret("", key)).toBe("");
    expect(decryptSecret("", key)).toBe("");
    expect(decryptSecret(null, key)).toBe("");
    expect(decryptSecret(undefined, key)).toBe("");
  });

  it("writes the documented v1:nonce:tag:ciphertext format without the plaintext", () => {
    const payload = encryptSecret("hunter2", key);
    const [version, nonce, tag, ciphertext] = parts(payload);
    expect(version).toBe("v1");
    expect(Buffer.from(nonce, "base64url")).toHaveLength(12);
    expect(Buffer.from(tag, "base64url")).toHaveLength(16);
    expect(Buffer.from(ciphertext, "base64url")).toHaveLength("hunter2".length);
    expect(payload).not.toContain("hunter2");
  });

  it("uses a fresh nonce each time", () => {
    const first = encryptSecret("same", key);
    const second = encryptSecret("same", key);
    expect(first).not.toBe(second);
    expect(parts(first)[1]).not.toBe(parts(second)[1]);
  });

  it("fails with the wrong key", () => {
    expect(() => decryptSecret(encryptSecret("hunter2", key), otherKey)).toThrow();
  });

  it.each([
    ["ciphertext", 3],
    ["tag", 2],
    ["nonce", 1],
  ])("fails when a bit of the %s is flipped", (_name, index) => {
    const p = parts(encryptSecret("hunter2", key));
    const bytes = Buffer.from(p[index], "base64url");
    bytes[0] ^= 1;
    p[index] = bytes.toString("base64url");
    expect(() => decryptSecret(p.join(":"), key)).toThrow();
  });

  it("binds the ciphertext to the secret's purpose (associated data)", async () => {
    const { createCipheriv } = await import("node:crypto");
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(Buffer.from("some-other-purpose"));
    const ciphertext = Buffer.concat([cipher.update("hunter2", "utf8"), cipher.final()]);
    const forged = ["v1", nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(
      ":",
    );
    expect(() => decryptSecret(forged, key)).toThrow();
  });

  it.each([
    ["an unknown version", (p: string[]) => ["v2", ...p.slice(1)].join(":")],
    ["a missing part", (p: string[]) => p.slice(0, 3).join(":")],
    ["an extra part", (p: string[]) => [...p, "extra"].join(":")],
    ["an empty nonce", (p: string[]) => [p[0], "", p[2], p[3]].join(":")],
    ["an empty tag", (p: string[]) => [p[0], p[1], "", p[3]].join(":")],
    ["plain text", () => "not an encrypted secret"],
  ])("rejects %s with the format error", (_name, mutate) => {
    const payload = mutate(parts(encryptSecret("hunter2", key)));
    expect(() => decryptSecret(payload, key)).toThrow("Unsupported encrypted secret format");
  });

  it("requires a 32 byte master key on both sides", () => {
    for (const bad of [Buffer.alloc(0), Buffer.alloc(16), Buffer.alloc(33)]) {
      expect(() => encryptSecret("x", bad)).toThrow("Invalid master key length");
      expect(() => decryptSecret(encryptSecret("x", key), bad)).toThrow("Invalid master key length");
    }
  });

  it("does not check the key for empty values (nothing to protect)", () => {
    expect(encryptSecret("", Buffer.alloc(1))).toBe("");
    expect(decryptSecret("", Buffer.alloc(1))).toBe("");
  });

  // EncryptSecret writes 16 byte tags and decryptSecret pins authTagLength, so a truncated one is refused.
  it("rejects an authentication tag shorter than 16 bytes", () => {
    const p = parts(encryptSecret("hunter2", key));
    p[2] = Buffer.from(p[2], "base64url").subarray(0, 4).toString("base64url");
    expect(() => decryptSecret(p.join(":"), key)).toThrow();
  });

  it("rejects an authentication tag longer than 16 bytes", () => {
    const p = parts(encryptSecret("hunter2", key));
    p[2] = Buffer.concat([Buffer.from(p[2], "base64url"), Buffer.alloc(4)]).toString("base64url");
    expect(() => decryptSecret(p.join(":"), key)).toThrow();
  });
});

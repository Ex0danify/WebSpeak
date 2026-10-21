import { describe, expect, it } from "vitest";
import { createX25519Key, x25519SharedSecret } from "./x25519.js";

describe("x25519", () => {
  it("agrees on the shared secret from both sides", () => {
    const a = createX25519Key(Buffer.alloc(32, 1));
    const b = createX25519Key(Buffer.alloc(32, 2));
    expect(x25519SharedSecret(a.privateKey, b.publicKey)).toEqual(x25519SharedSecret(b.privateKey, a.publicKey));
  });

  it("is deterministic for a seed and random without one", () => {
    expect(createX25519Key(Buffer.alloc(32, 5)).publicKey).toEqual(createX25519Key(Buffer.alloc(32, 5)).publicKey);
    expect(createX25519Key().publicKey.equals(createX25519Key().publicKey)).toBe(false);
  });

  it("rejects wrong key sizes", () => {
    expect(() => createX25519Key(Buffer.alloc(16))).toThrow(RangeError);
    expect(() => x25519SharedSecret(Buffer.alloc(32), Buffer.alloc(16))).toThrow(RangeError);
  });
});

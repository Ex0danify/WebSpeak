import { beforeAll, describe, expect, it } from "vitest";
import { hashAdminPassword, validateAdminPassword, verifyAdminPassword, type AdminCredential } from "./adminPassword.js";

const PASSWORD = "correct horse battery";

describe("validateAdminPassword", () => {
  it.each([
    ["", "at least 12"],
    ["a".repeat(11), "at least 12"],
    ["a".repeat(1025), "too long"],
  ])("rejects %j-length input (%s)", (password, message) => {
    expect(validateAdminPassword(password)).toContain(message);
  });

  it("accepts the 12 and 1024 character boundaries", () => {
    expect(validateAdminPassword("a".repeat(12))).toBeNull();
    expect(validateAdminPassword("a".repeat(1024))).toBeNull();
  });

  it("counts characters, not bytes (a 12 character non-ASCII password is valid)", () => {
    expect(validateAdminPassword("ä".repeat(12))).toBeNull();
  });
});

describe("hashAdminPassword", () => {
  let credential: AdminCredential;

  beforeAll(async () => {
    credential = await hashAdminPassword(PASSWORD);
  });

  it("produces a version 1 credential with the documented defaults", () => {
    expect(credential).toMatchObject({
      version: 1,
      username: "admin",
      mustChangePassword: false,
      parameters: { N: 32768, r: 8, p: 1 },
    });
    expect(Buffer.from(credential.salt, "base64url")).toHaveLength(16);
    expect(Buffer.from(credential.hash, "base64url")).toHaveLength(64);
  });

  it("never stores the password in the credential", () => {
    expect(JSON.stringify(credential)).not.toContain(PASSWORD);
  });

  it("uses a fresh salt each time, so equal passwords give different hashes", async () => {
    const other = await hashAdminPassword(PASSWORD);
    expect(other.salt).not.toBe(credential.salt);
    expect(other.hash).not.toBe(credential.hash);
  });

  it("honours the username and mustChangePassword options", async () => {
    const custom = await hashAdminPassword(PASSWORD, { username: "root", mustChangePassword: true });
    expect(custom).toMatchObject({ username: "root", mustChangePassword: true });
  });

  it("refuses a password that fails the minimum rules", async () => {
    await expect(hashAdminPassword("short")).rejects.toThrow("at least 12");
    await expect(hashAdminPassword("a".repeat(1025))).rejects.toThrow("too long");
  });

  it("allowWeakPassword skips the rules (used for the first-run bootstrap credential)", async () => {
    const weak = await hashAdminPassword("admin", { allowWeakPassword: true, mustChangePassword: true });
    expect(await verifyAdminPassword("admin", weak)).toBe(true);
  });
});

describe("verifyAdminPassword", () => {
  let credential: AdminCredential;

  beforeAll(async () => {
    credential = await hashAdminPassword(PASSWORD);
  });

  it("accepts the right password and rejects a wrong one", async () => {
    expect(await verifyAdminPassword(PASSWORD, credential)).toBe(true);
    expect(await verifyAdminPassword(`${PASSWORD}!`, credential)).toBe(false);
    expect(await verifyAdminPassword("", credential)).toBe(false);
  });

  it("is case sensitive", async () => {
    expect(await verifyAdminPassword(PASSWORD.toUpperCase(), credential)).toBe(false);
  });

  it("rejects oversize input without deriving a key", async () => {
    expect(await verifyAdminPassword("a".repeat(1025), credential)).toBe(false);
  });

  it("rejects non-string input", async () => {
    expect(await verifyAdminPassword(undefined as unknown as string, credential)).toBe(false);
    expect(await verifyAdminPassword(1234 as unknown as string, credential)).toBe(false);
  });

  it("rejects an unknown credential version", async () => {
    expect(await verifyAdminPassword(PASSWORD, { ...credential, version: 2 as unknown as 1 })).toBe(false);
  });

  it("rejects a tampered hash", async () => {
    const flipped = Buffer.from(credential.hash, "base64url");
    flipped[0] ^= 0xff;
    expect(await verifyAdminPassword(PASSWORD, { ...credential, hash: flipped.toString("base64url") })).toBe(false);
  });

  it("rejects a stored hash of the wrong length instead of throwing", async () => {
    const short = Buffer.from(credential.hash, "base64url").subarray(0, 32).toString("base64url");
    expect(await verifyAdminPassword(PASSWORD, { ...credential, hash: short })).toBe(false);
    expect(await verifyAdminPassword(PASSWORD, { ...credential, hash: "" })).toBe(false);
  });

  it("rejects a different salt", async () => {
    const salt = Buffer.alloc(16, 1).toString("base64url");
    expect(await verifyAdminPassword(PASSWORD, { ...credential, salt })).toBe(false);
  });

  it("returns false, not an exception, for unusable scrypt parameters", async () => {
    expect(await verifyAdminPassword(PASSWORD, { ...credential, parameters: { N: 3, r: 8, p: 1 } })).toBe(false);
  });

  it("verifies with the parameters stored in the credential, so old hashes keep working", async () => {
    const { scryptSync } = await import("node:crypto");
    const salt = Buffer.alloc(16, 9);
    const hash = scryptSync(PASSWORD, salt, 64, { N: 1024, r: 8, p: 1 });
    const legacy: AdminCredential = {
      version: 1,
      username: "admin",
      mustChangePassword: false,
      salt: salt.toString("base64url"),
      hash: hash.toString("base64url"),
      parameters: { N: 1024, r: 8, p: 1 },
    };
    expect(await verifyAdminPassword(PASSWORD, legacy)).toBe(true);
    expect(await verifyAdminPassword("wrong password!", legacy)).toBe(false);
  });
});

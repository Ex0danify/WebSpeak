import { describe, expect, it } from "vitest";
import { generateIdentity } from "../crypto/identity.js";
import { ts3Uid, ts6Uid } from "../crypto/uid.js";
import { avatarDeletePath, avatarDownloadPath, avatarFileKey } from "./avatarFiles.js";

const SEQUENCE_UID = Buffer.from(Array.from({ length: 20 }, (_, i) => i)).toString("base64");

describe("avatar file names", () => {
  it("spells every nibble of the UID as a letter", () => {
    expect(avatarFileKey(SEQUENCE_UID)).toBe("aaabacadaeafagahaiajakalamanaoapbabbbcbd");
    expect(avatarFileKey(Buffer.alloc(20, 0xff).toString("base64"))).toBe("p".repeat(40));
  });

  it("takes TS3 and TS6 UIDs", () => {
    const { publicKeyBase64 } = generateIdentity(0);
    expect(avatarFileKey(ts3Uid(publicKeyBase64))).toMatch(/^[a-p]{40}$/);
    expect(avatarFileKey(ts6Uid(publicKeyBase64))).toMatch(/^[a-p]{64}$/);
  });

  it("downloads by the letter key and deletes by the UID", () => {
    const uid = Buffer.alloc(20, 0xfb).toString("base64");
    expect(uid).toContain("/");
    expect(avatarDownloadPath(uid)).toBe(`/avatar_${"pl".repeat(20)}`);
    expect(avatarDeletePath(uid)).toBe(`/avatar_${uid}`);
  });

  it("refuses anything that is not a UID", () => {
    for (const uid of ["", "ServerQuery", Buffer.alloc(16).toString("base64"), `${SEQUENCE_UID.slice(0, -1)}`, `${SEQUENCE_UID}\n`]) {
      expect(() => avatarFileKey(uid)).toThrow(RangeError);
      expect(() => avatarDeletePath(uid)).toThrow(RangeError);
    }
  });
});

import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { aesCmac, eaxDecrypt, eaxEncrypt } from "./eax.js";

const hex = (text: string) => Buffer.from(text, "hex");
const MESSAGE =
  "6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411e5fbc1191a0a52eff69f2445df4f9b17ad2b417be66c3710";

describe("aesCmac", () => {
  // RFC 4493 section 4 (AES-128) and NIST SP 800-38B appendix D.3 (AES-256), messages of 0, 16, 40 and 64 bytes.
  const cases = [
    [
      "2b7e151628aed2a6abf7158809cf4f3c",
      [
        "bb1d6929e95937287fa37d129b756746",
        "070a16b46b4d4144f79bdd9dd04a287c",
        "dfa66747de9ae63030ca32611497c827",
        "51f0bebf7e3b9d92fc49741779363cfe",
      ],
    ],
    [
      "603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4",
      [
        "028962f61b7bf89efc6b551f4667d983",
        "28a7023f452e8f82bd4bf28d8c37c35c",
        "aaf3d8f1de5640c232f5b169b9c911e6",
        "e1992190549f6ed5696a2c056c315410",
      ],
    ],
  ] as const;

  for (const [key, macs] of cases) {
    it(`matches the published vectors for a ${key.length * 4}-bit key`, () => {
      [0, 16, 40, 64].forEach((length, i) => {
        expect(aesCmac(hex(key), hex(MESSAGE.slice(0, length * 2))).toString("hex")).toBe(macs[i]);
      });
    });
  }

  it("rejects a key that is neither 16 nor 32 bytes", () => {
    expect(() => aesCmac(Buffer.alloc(24), Buffer.alloc(0))).toThrow(RangeError);
  });
});

// Vectors 1 to 9 of the EAX paper (AES-128, full 16-byte tag): message, key, nonce, header, ciphertext ‖ tag.
const EAX_PAPER = [
  ["", "233952dee4d5ed5f9b9c6d6ff80ff478", "62ec67f9c3a4a407fcb2a8c49031a8b3", "6bfb914fd07eae6b", "e037830e8389f27b025a2d6527e79d01"],
  [
    "f7fb",
    "91945d3f4dcbee0bf45ef52255f095a4",
    "becaf043b0a23d843194ba972c66debd",
    "fa3bfd4806eb53fa",
    "19dd5c4c9331049d0bdab0277408f67967e5",
  ],
  [
    "1a47cb4933",
    "01f74ad64077f2e704c0f60ada3dd523",
    "70c3db4f0d26368400a10ed05d2bff5e",
    "234a3463c1264ac6",
    "d851d5bae03a59f238a23e39199dc9266626c40f80",
  ],
  [
    "481c9e39b1",
    "d07cf6cbb7f313bdde66b727afd3c5e8",
    "8408dfff3c1a2b1292dc199e46b7d617",
    "33cce2eabff5a79d",
    "632a9d131ad4c168a4225d8e1ff755939974a7bede",
  ],
  [
    "40d0c07da5e4",
    "35b6d0580005bbc12b0587124557d2c2",
    "fdb6b06676eedc5c61d74276e1f8e816",
    "aeb96eaebe2970e9",
    "071dfe16c675cb0677e536f73afe6a14b74ee49844dd",
  ],
  [
    "4de3b35c3fc039245bd1fb7d",
    "bd8e6e11475e60b268784c38c62feb22",
    "6eac5c93072d8e8513f750935e46da1b",
    "d4482d1ca78dce0f",
    "835bb4f15d743e350e728414abb8644fd6ccb86947c5e10590210a4f",
  ],
  [
    "8b0a79306c9ce7ed99dae4f87f8dd61636",
    "7c77d6e813bed5ac98baa417477a2e7d",
    "1a8c98dcd73d38393b2bf1569deefc19",
    "65d2017990d62528",
    "02083e3979da014812f59f11d52630da30137327d10649b0aa6e1c181db617d7f2",
  ],
  [
    "1bda122bce8a8dbaf1877d962b8592dd2d56",
    "5fff20cafab119ca2fc73549e20f5b0d",
    "dde59b97d722156d4d9aff2bc7559826",
    "54b9f04e6a09189a",
    "2ec47b2c4954a489afc7ba4897edcdae8cc33b60450599bd02c96382902aef7f832a",
  ],
  [
    "6cf36720872b8513f6eab1a8a44438d5ef11",
    "a4a4782bcffd3ec5e7ef6d8c34a56123",
    "b781fcf2f75fa5a8de97a9ca48e522ec",
    "899a175897561d7e",
    "0de18fd0fdd91e7af19f1d8ee8733938b1e8e7f6d2231618102fdb7fe55ff1991700",
  ],
] as const;

describe("eaxEncrypt and eaxDecrypt", () => {
  it("match the vectors of the EAX paper", () => {
    for (const [message, key, nonce, header, sealed] of EAX_PAPER) {
      const { ciphertext, tag } = eaxEncrypt(hex(key), hex(nonce), hex(header), hex(message), 16);
      expect(Buffer.concat([ciphertext, tag]).toString("hex")).toBe(sealed);
      const opened = eaxDecrypt(hex(key), hex(nonce), hex(header), ciphertext, tag);
      expect(opened?.toString("hex")).toBe(message);
    }
  });

  it("truncates the tag to 8 bytes by default and opens with the short tag", () => {
    const [message, key, nonce, header, sealed] = EAX_PAPER[5];
    const { ciphertext, tag } = eaxEncrypt(hex(key), hex(nonce), hex(header), hex(message));
    expect(tag.toString("hex")).toBe(sealed.slice(message.length, message.length + 16));
    expect(eaxDecrypt(hex(key), hex(nonce), hex(header), ciphertext, tag)?.toString("hex")).toBe(message);
  });

  it("returns undefined when ciphertext, header, nonce or tag were changed", () => {
    const key = randomBytes(32);
    const nonce = randomBytes(32);
    const header = Buffer.from([0, 2, 0, 0, 0x22]);
    const { ciphertext, tag } = eaxEncrypt(key, nonce, header, Buffer.from("clientinit client_nickname=a"));
    const flip = (data: Buffer, at: number) => {
      const copy = Buffer.from(data);
      copy[at] ^= 1;
      return copy;
    };
    expect(eaxDecrypt(key, nonce, header, flip(ciphertext, 3), tag)).toBeUndefined();
    expect(eaxDecrypt(key, nonce, flip(header, 4), ciphertext, tag)).toBeUndefined();
    expect(eaxDecrypt(key, flip(nonce, 0), header, ciphertext, tag)).toBeUndefined();
    expect(eaxDecrypt(key, nonce, header, ciphertext, flip(tag, 7))).toBeUndefined();
    expect(eaxDecrypt(key, nonce, header, ciphertext, Buffer.alloc(0))).toBeUndefined();
    expect(eaxDecrypt(key, nonce, header, ciphertext, Buffer.alloc(17))).toBeUndefined();
  });

  it("rejects a tag length outside 1 to 16", () => {
    expect(() => eaxEncrypt(Buffer.alloc(16), Buffer.alloc(16), Buffer.alloc(0), Buffer.alloc(0), 0)).toThrow(RangeError);
    expect(() => eaxEncrypt(Buffer.alloc(16), Buffer.alloc(16), Buffer.alloc(0), Buffer.alloc(0), 17)).toThrow(RangeError);
  });

  it("round-trips random AES-128 packets through encrypt and decrypt", () => {
    for (let i = 0; i < 50; i++) {
      const key = randomBytes(16);
      const nonce = randomBytes(16);
      const header = randomBytes(i % 2 ? 5 : 3);
      const plain = randomBytes(i * 10);
      const { ciphertext, tag } = eaxEncrypt(key, nonce, header, plain);
      const opened = eaxDecrypt(key, nonce, header, ciphertext, tag);
      expect(opened?.equals(plain)).toBe(true);
    }
  });
});

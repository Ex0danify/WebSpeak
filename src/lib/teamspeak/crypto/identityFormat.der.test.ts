import { describe, expect, it } from "vitest";
import { decodeTsPublicKey, encodeTsPublicKey } from "./identityFormat.js";

const x = Buffer.alloc(32, 0x11);
const y = Buffer.from([0x80, ...Buffer.alloc(31, 0x22)]);
const int = (value: number[]) => [0x02, value.length, ...value];
const seq = (...items: number[][]) => {
  const body = items.flat();
  return Buffer.from([0x30, body.length, ...body]);
};

describe("encodeTsPublicKey", () => {
  it("writes the canonical shape with a sign byte where the high bit is set", () => {
    const der = encodeTsPublicKey({ x, y });
    expect(der.subarray(0, 9).toString("hex")).toBe("304c03020700020120");
    expect(der[9]).toBe(0x02);
    expect(der[10]).toBe(32);
    expect(der[43]).toBe(0x02);
    expect(der[44]).toBe(33);
    expect(der[45]).toBe(0);
  });

  it("drops leading zero bytes of a coordinate", () => {
    const short = Buffer.from([0, 0, ...Buffer.alloc(30, 0x33)]);
    const der = encodeTsPublicKey({ x: short, y: x });
    expect(der[10]).toBe(30);
    expect(decodeTsPublicKey(der)).toEqual({ x: short, y: x });
  });
});

describe("decodeTsPublicKey", () => {
  it("reads back what encodeTsPublicKey wrote", () => {
    expect(decodeTsPublicKey(encodeTsPublicKey({ x, y }))).toEqual({ x, y });
  });

  it("reads the old shape that starts with the coordinates", () => {
    expect(decodeTsPublicKey(seq(int([...x]), int([0, ...y]), [0x03, 0x02, 0x07, 0x00], int([32])))).toEqual({ x, y });
  });

  it("reads long-form lengths", () => {
    const body = [...int([...x]), ...int([0, ...y])];
    expect(decodeTsPublicKey(Buffer.from([0x30, 0x81, body.length, ...body]))).toEqual({ x, y });
    expect(decodeTsPublicKey(Buffer.from([0x30, 0x82, 0, body.length, ...body]))).toEqual({ x, y });
  });

  it("rejects malformed input instead of reading past the end", () => {
    const canonical = encodeTsPublicKey({ x, y });
    for (const bad of [
      Buffer.alloc(0),
      Buffer.from([0x30]),
      Buffer.from([0x31, 0x00]),
      canonical.subarray(0, canonical.length - 1),
      Buffer.from([0x30, 0x83, 0, 0, 1, 0]),
      Buffer.from([0x30, 0x82, 0]),
      Buffer.from([0x30, 0x04, 0x02, 0x05, 0x01, 0x02]),
      seq(int([...x])),
      seq([0x03, 0x02, 0x07, 0x00], [0x04, 0x01, 0x20], int([...x]), int([...x])),
      seq([0x03, 0x02, 0x07, 0x00], int([32]), int([...x])),
      seq(int([]), int([...x])),
      seq(int([0x80, ...x]), int([...x])),
      seq(int([1, ...x]), int([...x])),
      seq([0x04, 0x01, 0x00], int([...x])),
    ]) {
      expect(decodeTsPublicKey(bad), bad.toString("hex")).toBeUndefined();
    }
  });
});

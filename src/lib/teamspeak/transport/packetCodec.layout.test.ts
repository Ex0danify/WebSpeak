import { describe, expect, it } from "vitest";
import { DUMMY_PACKET_KEY } from "../crypto/packetKeys.js";
import { encodePacket, openPacket, parsePacket } from "./packetCodec.js";
import { INIT1_MAC, maxPayloadBytes, PacketFlag, PacketType } from "./packetTypes.js";

const fakeMac = Buffer.from("0102030405060708", "hex");

describe("encodePacket and parsePacket", () => {
  it("writes the client header as id, client id, type and flags", () => {
    const datagram = encodePacket(
      "c2s",
      { type: PacketType.command, flags: PacketFlag.newProtocol, id: 0x1234, clientId: 0x0506, payload: Buffer.from("x") },
      DUMMY_PACKET_KEY,
      fakeMac,
    );
    expect(datagram.subarray(8, 13).toString("hex")).toBe("1234050622");
    expect(parsePacket("c2s", datagram)).toMatchObject({ type: 2, flags: 0x20, id: 0x1234, clientId: 0x0506 });
  });

  it("writes the server header without a client id", () => {
    const datagram = encodePacket(
      "s2c",
      { type: PacketType.ack, flags: 0, id: 7, payload: Buffer.from([0, 7]) },
      DUMMY_PACKET_KEY,
      fakeMac,
    );
    expect(datagram.subarray(8, 11).toString("hex")).toBe("000706");
    const parsed = parsePacket("s2c", datagram)!;
    expect(parsed.clientId).toBe(0);
    expect(openPacket(parsed, DUMMY_PACKET_KEY, undefined)?.toString("hex")).toBe("0007");
  });

  it("puts TS3INIT1 on Init1 and the fake MAC on unencrypted packets, both in plain text", () => {
    const init1 = encodePacket(
      "c2s",
      { type: PacketType.init1, flags: PacketFlag.unencrypted, id: 101, payload: Buffer.from([9]) },
      undefined,
      fakeMac,
    );
    expect(init1.subarray(0, 8).equals(INIT1_MAC)).toBe(true);
    expect(init1.at(-1)).toBe(9);
    const ping = encodePacket(
      "c2s",
      { type: PacketType.ping, flags: PacketFlag.unencrypted, id: 1, payload: Buffer.alloc(0) },
      undefined,
      fakeMac,
    );
    expect(ping.subarray(0, 8).equals(fakeMac)).toBe(true);
    expect(ping.length).toBe(13);
  });

  it("rejects fields that do not fit the header or the datagram", () => {
    const payload = Buffer.alloc(1);
    const base = { type: PacketType.voice, flags: PacketFlag.unencrypted, id: 1, payload };
    expect(() => encodePacket("c2s", { ...base, id: 0x10000 }, undefined, fakeMac)).toThrow(RangeError);
    expect(() => encodePacket("c2s", { ...base, clientId: -1 }, undefined, fakeMac)).toThrow(RangeError);
    expect(() => encodePacket("c2s", { ...base, flags: 0x81 }, undefined, fakeMac)).toThrow(RangeError);
    expect(() => encodePacket("c2s", { ...base, flags: 0 }, undefined, fakeMac)).toThrow(/needs a key/);
    const full = { ...base, payload: Buffer.alloc(maxPayloadBytes("c2s")) };
    expect(encodePacket("c2s", full, undefined, fakeMac).length).toBe(500);
    expect(() => encodePacket("c2s", { ...full, payload: Buffer.alloc(488) }, undefined, fakeMac)).toThrow(/over 500/);
  });

  it("returns undefined for datagrams shorter than a header or with an unknown type", () => {
    expect(parsePacket("s2c", Buffer.alloc(10))).toBeUndefined();
    expect(parsePacket("c2s", Buffer.alloc(12))).toBeUndefined();
    expect(parsePacket("s2c", Buffer.from("0000000000000000000009", "hex"))).toBeUndefined();
    expect(parsePacket("s2c", Buffer.alloc(11))?.body.length).toBe(0);
  });
});

describe("openPacket", () => {
  const sealed = encodePacket(
    "s2c",
    { type: PacketType.command, flags: 0, id: 3, payload: Buffer.from("hello") },
    DUMMY_PACKET_KEY,
    fakeMac,
  );

  it("rejects a wrong key, a changed header and a missing key", () => {
    const parsed = parsePacket("s2c", sealed)!;
    expect(openPacket(parsed, DUMMY_PACKET_KEY, undefined)?.toString()).toBe("hello");
    expect(openPacket(parsed, { key: Buffer.alloc(16), nonce: DUMMY_PACKET_KEY.nonce }, undefined)).toBeUndefined();
    expect(openPacket(parsed, undefined, undefined)).toBeUndefined();
    const changed = Buffer.from(sealed);
    changed[9] ^= 1;
    expect(openPacket(parsePacket("s2c", changed)!, DUMMY_PACKET_KEY, undefined)).toBeUndefined();
  });

  it("checks the fake MAC once one is known and accepts any MAC before", () => {
    const ping = parsePacket(
      "s2c",
      encodePacket("s2c", { type: PacketType.ping, flags: PacketFlag.unencrypted, id: 1, payload: Buffer.alloc(0) }, undefined, fakeMac),
    )!;
    expect(openPacket(ping, undefined, fakeMac)).toBeDefined();
    expect(openPacket(ping, undefined, Buffer.alloc(8))).toBeUndefined();
    expect(openPacket(ping, undefined, undefined)).toBeDefined();
  });

  it("accepts Init1 only with the TS3INIT1 MAC", () => {
    const init1 = encodePacket(
      "s2c",
      { type: PacketType.init1, flags: PacketFlag.unencrypted, id: 101, payload: Buffer.from([1]) },
      undefined,
      fakeMac,
    );
    expect(openPacket(parsePacket("s2c", init1)!, undefined, undefined)?.[0]).toBe(1);
    init1[0] ^= 1;
    expect(openPacket(parsePacket("s2c", init1)!, undefined, undefined)).toBeUndefined();
  });
});

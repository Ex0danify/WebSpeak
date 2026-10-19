import { describe, expect, it } from "vitest";
import { TeamSpeakTransportError } from "../errors/teamSpeakErrors.js";
import { type PacketPart, splitPayload, takeMessage } from "./fragmenter.js";
import { PacketFlag } from "./packetTypes.js";

const { fragmented, compressed, newProtocol } = PacketFlag;

describe("splitPayload", () => {
  it("keeps a payload that fits in one packet", () => {
    expect(splitPayload(Buffer.alloc(487), 487, compressed)).toEqual([{ flags: compressed, payload: Buffer.alloc(487) }]);
  });

  it("flags the first and the last part, keeps Compressed on the first only", () => {
    const parts = splitPayload(Buffer.alloc(1200, 1), 487, compressed | newProtocol);
    expect(parts.map((part) => part.payload.length)).toEqual([487, 487, 226]);
    expect(parts.map((part) => part.flags)).toEqual([fragmented | compressed | newProtocol, newProtocol, fragmented | newProtocol]);
  });

  it("flags both parts of a payload just over one packet", () => {
    expect(splitPayload(Buffer.alloc(488), 487, 0).map((part) => part.flags)).toEqual([fragmented, fragmented]);
  });
});

describe("takeMessage", () => {
  const fill = (parts: PacketPart[], start = 0) => new Map(parts.map((part, i) => [start + i, part]));

  it("takes a single packet", () => {
    const buffer = fill([{ flags: compressed, payload: Buffer.from("a") }]);
    expect(takeMessage(buffer, 0, 100)).toEqual({ flags: compressed, payload: Buffer.from("a"), count: 1 });
    expect(buffer.size).toBe(0);
  });

  it("waits while a part is missing and joins the parts once complete", () => {
    const parts = splitPayload(Buffer.from("abcdefgh"), 3, compressed);
    const buffer = new Map([
      [10, parts[0]],
      [12, parts[2]],
    ]);
    expect(takeMessage(buffer, 10, 100)).toBeUndefined();
    buffer.set(11, parts[1]);
    expect(takeMessage(buffer, 10, 100)).toEqual({ flags: compressed, payload: Buffer.from("abcdefgh"), count: 3 });
    expect(buffer.size).toBe(0);
  });

  it("returns undefined when nothing is at the position", () => {
    expect(takeMessage(new Map(), 0, 100)).toBeUndefined();
  });

  it("throws when a split command grows over the limit", () => {
    const buffer = fill(splitPayload(Buffer.alloc(30), 10, 0));
    expect(() => takeMessage(buffer, 0, 25)).toThrow(TeamSpeakTransportError);
  });
});

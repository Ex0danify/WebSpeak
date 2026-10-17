import { describe, expect, it } from "vitest";
import { splitPayload } from "./fragmenter.js";
import { ReliableReceiver } from "./reliableReceiver.js";

const part = (text: string) => ({ flags: 0, payload: Buffer.from(text) });
const texts = (messages: { payload: Buffer }[]) => messages.map((message) => message.payload.toString());

describe("ReliableReceiver", () => {
  it("delivers in order and holds later packets until the gap is filled", () => {
    const receiver = new ReliableReceiver();
    expect(receiver.classify(1)).toBe("new");
    expect(texts(receiver.accept(1, part("b")))).toEqual([]);
    expect(texts(receiver.accept(2, part("c")))).toEqual([]);
    expect(texts(receiver.accept(0, part("a")))).toEqual(["a", "b", "c"]);
    expect(receiver.next).toBe(3);
  });

  it("calls delivered and buffered packets duplicates", () => {
    const receiver = new ReliableReceiver();
    receiver.accept(0, part("a"));
    receiver.accept(2, part("c"));
    expect(receiver.classify(0)).toBe("duplicate");
    expect(receiver.classify(2)).toBe("duplicate");
    expect(receiver.classify(-1)).toBe("duplicate");
    expect(receiver.classify(1)).toBe("new");
  });

  it("does not accept packets beyond the window", () => {
    const receiver = new ReliableReceiver({ windowSize: 4 });
    expect(receiver.classify(3)).toBe("new");
    expect(receiver.classify(4)).toBe("ahead");
  });

  it("reassembles fragments, also when they arrive in reverse", () => {
    const receiver = new ReliableReceiver();
    const parts = splitPayload(Buffer.from("0123456789"), 4, 0);
    expect(receiver.accept(2, parts[2])).toEqual([]);
    expect(receiver.accept(1, parts[1])).toEqual([]);
    expect(texts(receiver.accept(0, parts[0]))).toEqual(["0123456789"]);
    expect(receiver.next).toBe(3);
  });

  it("resolves ids across the wrap from where it is", () => {
    const receiver = new ReliableReceiver({}, 0xffff);
    expect(receiver.resolve(0)).toBe(0x10000);
    receiver.accept(0xffff, part("x"));
    expect(texts(receiver.accept(receiver.resolve(0), part("y")))).toEqual(["y"]);
    expect(receiver.next).toBe(0x10001);
  });
});

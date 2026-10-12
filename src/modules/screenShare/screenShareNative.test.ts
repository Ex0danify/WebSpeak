import { describe, expect, it } from "vitest";
import { nativeViewerPeerId, parseNativeViewerPeerId, parseStreamSignalPayload, toBrowserScreenSignal } from "./screenShareNative.js";

const payload = (cmd: string, args: Record<string, unknown>) => ({ cmd, args });

describe("native viewer peer id", () => {
  it("round-trips a client id", () => {
    expect(nativeViewerPeerId(42)).toBe("ts-viewer-42");
    expect(parseNativeViewerPeerId("ts-viewer-42")).toBe(42);
  });

  it.each(["ts-viewer-", "ts-viewer-0", "ts-viewer-1x", "x-ts-viewer-1", "ts-viewer--1", "", "ts-viewer-99999999999999999999"])(
    "rejects %j",
    (id) => {
      expect(parseNativeViewerPeerId(id)).toBeUndefined();
    },
  );
});

describe("parseStreamSignalPayload", () => {
  it("accepts an object with a string cmd and object args", () => {
    expect(parseStreamSignalPayload('{"cmd":"offer","args":{"sdp":"v=0"}}')).toEqual(payload("offer", { sdp: "v=0" }));
  });

  it.each(["", "{", "null", "[]", '{"cmd":1,"args":{}}', '{"cmd":"x"}', '{"cmd":"x","args":[]}', '{"cmd":"x","args":null}'])(
    "rejects %j",
    (raw) => {
      expect(parseStreamSignalPayload(raw)).toBeNull();
    },
  );
});

describe("toBrowserScreenSignal", () => {
  it.each([
    ["joinResponse offer", payload("joinResponse", { offer: "o" }), { kind: "offer", sdp: "o" }],
    ["joinResponse sdp", payload("joinResponse", { sdp: "s" }), { kind: "offer", sdp: "s" }],
    ["joinResponse accepted without sdp", payload("joinResponse", { decision: true }), null],
    ["offer", payload("offer", { offer: "o" }), { kind: "offer", sdp: "o" }],
    ["reconnectOffer sdp", payload("reconnectOffer", { sdp: "s" }), { kind: "offer", sdp: "s" }],
    ["offer without sdp", payload("offer", {}), null],
    ["answer", payload("answer", { answer: "a" }), { kind: "answer", sdp: "a" }],
    ["answer sdp", payload("answer", { sdp: "a" }), { kind: "answer", sdp: "a" }],
    ["answer without sdp", payload("answer", { answer: 1 }), null],
    ["iceCandidate", payload("iceCandidate", { sdp: "c" }), { kind: "iceCandidate", candidate: "c" }],
    [
      "iceCandidate with mid and line",
      payload("iceCandidate", { candidate: "c", mid: "0", mLine: 1 }),
      { kind: "iceCandidate", candidate: "c", sdpMid: "0", sdpMLineIndex: 1 },
    ],
    ["iceCandidate ignores bad mid", payload("iceCandidate", { sdp: "c", mid: 0, mLine: "1" }), { kind: "iceCandidate", candidate: "c" }],
    ["iceCandidate empty", payload("iceCandidate", {}), null],
    ["unknown cmd", payload("bye", {}), null],
  ])("%s", (_name, input, expected) => {
    expect(toBrowserScreenSignal(input)).toEqual(expected);
  });

  it.each([false, 0, "0"])("joinResponse decision %j closes", (decision) => {
    expect(toBrowserScreenSignal(payload("joinResponse", { decision, offer: "o" }))).toEqual({ kind: "close" });
  });
});

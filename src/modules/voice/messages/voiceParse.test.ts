import { describe, expect, it } from "vitest";
import { isWebRtcStopMessage, parseNumber, parseWebRtcOffer } from "./voiceParse.js";

const offer = (payload: Record<string, unknown>) => JSON.stringify({ type: "webrtcOffer", payload });

describe("parseWebRtcOffer", () => {
  it("accepts an offer and defaults the flags to false", () => {
    expect(parseWebRtcOffer(offer({ sdp: { type: "offer", sdp: "v=0" } }))).toEqual({ type: "offer", sdp: "v=0", muted: false, accompanimentActive: false });
  });

  it("carries the muted and accompaniment flags", () => {
    expect(parseWebRtcOffer(offer({ sdp: { type: "offer", sdp: "v=0" }, muted: true, accompanimentActive: true }))).toMatchObject({ muted: true, accompanimentActive: true });
  });

  it.each([
    ["not json", "{"],
    ["other type", JSON.stringify({ type: "x", payload: {} })],
    ["no payload", JSON.stringify({ type: "webrtcOffer" })],
    ["no sdp object", offer({})],
    ["answer instead of offer", offer({ sdp: { type: "answer", sdp: "v=0" } })],
    ["sdp not a string", offer({ sdp: { type: "offer", sdp: 1 } })],
    ["sdp over 256 KiB", offer({ sdp: { type: "offer", sdp: "x".repeat(256 * 1024 + 1) } })],
    ["muted not a boolean", offer({ sdp: { type: "offer", sdp: "v=0" }, muted: "yes" })],
    ["accompanimentActive not a boolean", offer({ sdp: { type: "offer", sdp: "v=0" }, accompanimentActive: 1 })],
  ])("rejects %s", (_name, raw) => {
    expect(parseWebRtcOffer(raw)).toBeNull();
  });

  it("accepts an sdp of exactly 256 KiB", () => {
    expect(parseWebRtcOffer(offer({ sdp: { type: "offer", sdp: "x".repeat(256 * 1024) } }))).not.toBeNull();
  });
});

describe("isWebRtcStopMessage", () => {
  it("matches only webrtcStop", () => {
    expect(isWebRtcStopMessage(JSON.stringify({ type: "webrtcStop" }))).toBe(true);
    expect(isWebRtcStopMessage(JSON.stringify({ type: "webrtcOffer" }))).toBe(false);
    expect(isWebRtcStopMessage("[]")).toBe(false);
    expect(isWebRtcStopMessage("not json")).toBe(false);
  });
});

describe("parseNumber", () => {
  it.each([
    ["12", 12],
    ["1", 1],
    [undefined, undefined],
    ["", undefined],
    ["0", undefined],
    ["-3", undefined],
    ["1.5", undefined],
    ["12a", undefined],
    ["9007199254740993", undefined],
  ])("parses %j as %j", (value, expected) => {
    expect(parseNumber(value)).toBe(expected);
  });
});

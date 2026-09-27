import { describe, expect, it } from "vitest";
import { DEFAULT_SCREEN_SHARE_ICE_SERVERS, normalizeScreenShareIceServers, parseScreenShareMessage } from "./screen-share.js";

describe("normalizeScreenShareIceServers", () => {
  it("falls back to TeamSpeak's public STUN servers when nothing usable is configured", () => {
    for (const configured of [undefined, [], [null, 5, "stun:a", ["stun:a"]], [{}, { urls: [] }, { urls: 7 }, { urls: "http://evil.test" }]]) {
      expect(normalizeScreenShareIceServers(configured)).toEqual([...DEFAULT_SCREEN_SHARE_ICE_SERVERS]);
    }
  });

  it("returns copies of the defaults, so a caller cannot change them for the next session", () => {
    const first = normalizeScreenShareIceServers();
    (first[0] as { urls: string }).urls = "stun:changed.test";
    first.pop();
    expect(normalizeScreenShareIceServers()).toEqual([...DEFAULT_SCREEN_SHARE_ICE_SERVERS]);
    expect(DEFAULT_SCREEN_SHARE_ICE_SERVERS).toHaveLength(2);
  });

  it("keeps stun, stuns, turn and turns URLs (any case, trimmed) and drops every other scheme", () => {
    const result = normalizeScreenShareIceServers([
      { urls: ["  stun:a.test:3478 ", "STUNS:b.test", "turn:c.test", "Turns:d.test", "http://e.test", "javascript:alert(1)", "", "   ", 5] },
    ]);
    expect(result).toEqual([{ urls: ["stun:a.test:3478", "STUNS:b.test", "turn:c.test", "Turns:d.test"] }]);
  });

  it("writes a single URL as a string and removes duplicate URLs", () => {
    expect(normalizeScreenShareIceServers([{ urls: "stun:a.test" }, { urls: ["stun:b.test", "stun:b.test"] }])).toEqual([{ urls: "stun:a.test" }, { urls: "stun:b.test" }]);
  });

  it("drops a URL longer than 512 characters and keeps one of exactly 512", () => {
    const exact = `stun:${"a".repeat(507)}`;
    expect(exact).toHaveLength(512);
    expect(normalizeScreenShareIceServers([{ urls: [exact, `${exact}a`] }])).toEqual([{ urls: exact }]);
  });

  it("passes a TURN username and credential through, and drops one that is too long or not a string", () => {
    expect(normalizeScreenShareIceServers([{ urls: "turn:t.test", username: "user", credential: "secret" }])).toEqual([{ urls: "turn:t.test", username: "user", credential: "secret" }]);
    expect(normalizeScreenShareIceServers([{ urls: "turn:t.test", username: "u".repeat(512), credential: "c".repeat(513) }])).toEqual([{ urls: "turn:t.test", username: "u".repeat(512) }]);
    expect(normalizeScreenShareIceServers([{ urls: "turn:t.test", username: 1, credential: {} }])).toEqual([{ urls: "turn:t.test" }]);
  });

  it("removes a repeated server by its URLs and username; the credential does not tell two servers apart", () => {
    const result = normalizeScreenShareIceServers([
      { urls: "turn:t.test", username: "a", credential: "one" },
      { urls: "turn:t.test", username: "a", credential: "two" },
      { urls: "turn:t.test", username: "b", credential: "one" },
    ]);
    expect(result).toEqual([{ urls: "turn:t.test", username: "a", credential: "one" }, { urls: "turn:t.test", username: "b", credential: "one" }]);
  });

  it("keeps at most 8 servers, in order", () => {
    const configured = Array.from({ length: 12 }, (_, i) => ({ urls: `stun:s${i}.test` }));
    expect(normalizeScreenShareIceServers(configured).map((server) => server.urls)).toEqual(configured.slice(0, 8).map((server) => server.urls));
  });
});

const parse = (message: unknown) => parseScreenShareMessage(JSON.stringify(message));
const invalid = (code: string) => ({ error: { code, message: expect.any(String) } });

describe("parseScreenShareMessage: what is not a screen share message", () => {
  it.each([
    ["text that is not JSON", "{oops"],
    ["a JSON string", JSON.stringify("screenShareList")],
    ["a JSON array", JSON.stringify([{ type: "screenShareList" }])],
    ["a JSON null", "null"],
    ["an object without a type", JSON.stringify({ streamId: "x" })],
    ["a type that is not a string", JSON.stringify({ type: 7 })],
    ["another command", JSON.stringify({ type: "poke", payload: {} })],
    ["a type that only contains the word", JSON.stringify({ type: "noscreenShareList" })],
  ])("returns null for %s, so the bridge tries the next parser", (_name, raw) => {
    expect(parseScreenShareMessage(raw)).toBeNull();
  });

  it("answers UNKNOWN_SCREEN_SHARE_MESSAGE for an unknown type with the prefix", () => {
    expect(parse({ type: "screenShareRecord" })).toEqual(invalid("UNKNOWN_SCREEN_SHARE_MESSAGE"));
  });
});

describe("parseScreenShareMessage: request ids", () => {
  it.each([["empty", ""], ["65 characters", "r".repeat(65)], ["a number", 5], ["null", null]])("refuses a request id that is %s, for every type", (_name, requestId) => {
    for (const type of ["screenShareList", "screenShareStart", "screenShareStop", "screenShareSignal"]) {
      expect(parse({ type, requestId, streamId: "s", targetPeerId: "p", signal: { kind: "close" } })).toEqual(invalid("INVALID_SCREEN_SHARE_REQUEST"));
    }
  });

  it("accepts 64 characters and keeps the id", () => {
    const requestId = "r".repeat(64);
    expect(parse({ type: "screenShareJoin", requestId, streamId: "s" })).toEqual({ type: "screenShareJoin", requestId, streamId: "s" });
  });
});

describe("parseScreenShareMessage: list and start", () => {
  it("parses a list request and ignores everything else in it", () => {
    expect(parse({ type: "screenShareList", streamId: "ignored" })).toEqual({ type: "screenShareList" });
  });

  it("parses a start with no fields, and keeps only a trimmed name, the request id and audio: true", () => {
    expect(parse({ type: "screenShareStart" })).toEqual({ type: "screenShareStart" });
    expect(parse({ type: "screenShareStart", requestId: "q", name: "  My screen  ", audio: true, extra: 1 })).toEqual({ type: "screenShareStart", requestId: "q", name: "My screen", audio: true });
    expect(parse({ type: "screenShareStart", audio: false })).toEqual({ type: "screenShareStart" });
  });

  it.each([["empty", ""], ["blank", "   "], ["121 characters", "n".repeat(121)], ["a number", 3], ["null", null]])("refuses a name that is %s", (_label, name) => {
    expect(parse({ type: "screenShareStart", name })).toEqual(invalid("INVALID_SCREEN_SHARE_NAME"));
  });

  it("accepts a name of 120 characters, and refuses audio that is not a boolean", () => {
    expect(parse({ type: "screenShareStart", name: "n".repeat(120) })).toEqual({ type: "screenShareStart", name: "n".repeat(120) });
    for (const audio of [1, "true", null]) expect(parse({ type: "screenShareStart", audio })).toEqual(invalid("INVALID_SCREEN_SHARE_AUDIO"));
  });
});

describe("parseScreenShareMessage: stop, join and leave", () => {
  it.each(["screenShareStop", "screenShareJoin", "screenShareLeave"])("%s needs a stream id of 1 to 128 characters", (type) => {
    expect(parse({ type, streamId: "s-1", extra: true })).toEqual({ type, streamId: "s-1" });
    expect(parse({ type, streamId: "s".repeat(128), requestId: "q" })).toEqual({ type, requestId: "q", streamId: "s".repeat(128) });
    for (const streamId of [undefined, "", "s".repeat(129), 5, null]) expect(parse({ type, streamId })).toEqual(invalid("INVALID_SCREEN_SHARE_STREAM"));
  });
});

describe("parseScreenShareMessage: signals", () => {
  const signal = (payload: unknown, overrides: Record<string, unknown> = {}) => parse({ type: "screenShareSignal", streamId: "s", targetPeerId: "p", signal: payload, ...overrides });

  it("checks the stream id first, then the peer id, then the signal", () => {
    expect(signal(null, { streamId: "", targetPeerId: "" })).toEqual(invalid("INVALID_SCREEN_SHARE_STREAM"));
    expect(signal(null, { targetPeerId: "" })).toEqual(invalid("INVALID_SCREEN_SHARE_PEER"));
    expect(signal(null)).toEqual(invalid("INVALID_SCREEN_SHARE_SIGNAL"));
    expect(signal({ kind: "close" }, { targetPeerId: "p".repeat(129) })).toEqual(invalid("INVALID_SCREEN_SHARE_PEER"));
    expect(signal({ kind: "close" }, { targetPeerId: "p".repeat(128) })).toMatchObject({ targetPeerId: "p".repeat(128) });
  });

  it("parses close, offer and answer, and keeps only the fields that belong to them", () => {
    expect(signal({ kind: "close", sdp: "ignored" })).toEqual({ type: "screenShareSignal", streamId: "s", targetPeerId: "p", signal: { kind: "close" } });
    expect(signal({ kind: "offer", sdp: "v=0", extra: 1 })).toMatchObject({ signal: { kind: "offer", sdp: "v=0" } });
    expect(signal({ kind: "answer", sdp: "v=0" })).toMatchObject({ signal: { kind: "answer", sdp: "v=0" } });
  });

  it("refuses an SDP that is empty, not a string or over 256 KiB, and accepts one of exactly 256 KiB", () => {
    for (const sdp of [undefined, "", 5, "x".repeat(256 * 1024 + 1)]) expect(signal({ kind: "offer", sdp })).toEqual(invalid("INVALID_SCREEN_SHARE_SIGNAL"));
    expect(signal({ kind: "offer", sdp: "x".repeat(256 * 1024) })).toMatchObject({ signal: { kind: "offer" } });
  });

  it("parses an ICE candidate with or without its media fields, and drops other fields", () => {
    expect(signal({ kind: "iceCandidate", candidate: "candidate:1", extra: 1 })).toMatchObject({ signal: { kind: "iceCandidate", candidate: "candidate:1" } });
    expect(signal({ kind: "iceCandidate", candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 })).toMatchObject({ signal: { sdpMid: "0", sdpMLineIndex: 0 } });
    expect(signal({ kind: "iceCandidate", candidate: "c", sdpMid: null, sdpMLineIndex: null })).toMatchObject({ signal: { sdpMid: null, sdpMLineIndex: null } });
    expect((signal({ kind: "iceCandidate", candidate: "c" }) as { signal: object }).signal).toEqual({ kind: "iceCandidate", candidate: "c" });
  });

  it("accepts an empty candidate (end of candidates) and one of exactly 8 KiB, and refuses a longer one", () => {
    expect(signal({ kind: "iceCandidate", candidate: "" })).toMatchObject({ signal: { candidate: "" } });
    expect(signal({ kind: "iceCandidate", candidate: "c".repeat(8 * 1024) })).toMatchObject({ signal: { kind: "iceCandidate" } });
    expect(signal({ kind: "iceCandidate", candidate: "c".repeat(8 * 1024 + 1) })).toEqual(invalid("INVALID_SCREEN_SHARE_SIGNAL"));
  });

  it.each([
    ["a missing candidate", { kind: "iceCandidate" }],
    ["a candidate that is not a string", { kind: "iceCandidate", candidate: 1 }],
    ["a media id that is a number", { kind: "iceCandidate", candidate: "c", sdpMid: 0 }],
    ["a line index of -1", { kind: "iceCandidate", candidate: "c", sdpMLineIndex: -1 }],
    ["a line index of 256", { kind: "iceCandidate", candidate: "c", sdpMLineIndex: 256 }],
    ["a line index that is not whole", { kind: "iceCandidate", candidate: "c", sdpMLineIndex: 1.5 }],
    ["a line index that is a string", { kind: "iceCandidate", candidate: "c", sdpMLineIndex: "1" }],
    ["an unknown kind", { kind: "hangup" }],
    ["a kind that is not a string", { kind: 1 }],
    ["a signal that is a string", "offer"],
  ])("refuses %s", (_name, payload) => {
    expect(signal(payload)).toEqual(invalid("INVALID_SCREEN_SHARE_SIGNAL"));
  });

  it("accepts a line index of 255", () => {
    expect(signal({ kind: "iceCandidate", candidate: "c", sdpMLineIndex: 255 })).toMatchObject({ signal: { sdpMLineIndex: 255 } });
  });
});

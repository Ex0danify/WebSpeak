import { describe, expect, it } from "vitest";
import { parseClientCommand, type ClientCommand } from "./voice-protocol.js";

function parse(value: unknown) {
  return parseClientCommand(JSON.stringify(value));
}

function errorCode(value: unknown): string | undefined {
  const result = parse(value);
  return "error" in result ? result.error.code : undefined;
}

/** One valid payload per command type; the tests below break one field at a time. */
const VALID: Record<ClientCommand["type"], Record<string, unknown>> = {
  switchChannel: { channelId: "12" },
  moveClient: { clientId: 7, channelId: "12" },
  sendTextMessage: { message: "hi" },
  sendServerMessage: { message: "hi" },
  sendPrivateMessage: { clientId: 7, message: "hi" },
  poke: { clientId: 7, message: "hey" },
  setAway: { away: true },
  setWhisperTargets: { targetIds: [1, 2] },
  setWhisperActive: { active: true },
  setMicrophoneMuted: { muted: false },
  setAccompanimentActive: { active: false },
  setMemberVolume: { clientId: 7, volume: 1 },
  latencyProbe: { sequence: "abc" },
};

describe("parseClientCommand envelope", () => {
  it("accepts every supported command type with a valid payload and passes it through", () => {
    for (const [type, payload] of Object.entries(VALID)) {
      expect(parse({ type, payload }), type).toEqual({ type, payload });
    }
  });

  it("keeps a string requestId and omits the key when there is none", () => {
    expect(parse({ type: "setAway", requestId: "r1", payload: { away: true } })).toEqual({
      type: "setAway",
      requestId: "r1",
      payload: { away: true },
    });
    expect("requestId" in (parse({ type: "setAway", payload: { away: true } }))).toBe(false);
  });

  it("rejects text that is not JSON", () => {
    expect(parseClientCommand("{nope")).toMatchObject({ error: { code: "INVALID_JSON" } });
    expect(parseClientCommand("")).toMatchObject({ error: { code: "INVALID_JSON" } });
  });

  it("rejects a message without a string type", () => {
    for (const value of [null, 5, "text", [], [{ type: "poke" }], {}, { type: 3 }, { type: null }]) {
      expect(errorCode(value), JSON.stringify(value)).toBe("INVALID_MESSAGE");
    }
  });

  it("rejects a requestId that is not a string or is longer than 64 characters", () => {
    expect(errorCode({ type: "setAway", requestId: 5, payload: { away: true } })).toBe("INVALID_REQUEST_ID");
    expect(errorCode({ type: "setAway", requestId: null, payload: { away: true } })).toBe("INVALID_REQUEST_ID");
    expect(errorCode({ type: "setAway", requestId: "x".repeat(65), payload: { away: true } })).toBe("INVALID_REQUEST_ID");
    expect(errorCode({ type: "setAway", requestId: "x".repeat(64), payload: { away: true } })).toBeUndefined();
  });

  it("rejects an unknown type, including inherited object keys", () => {
    for (const type of ["listChannels", "SWITCHCHANNEL", "", "toString", "__proto__"]) {
      expect(errorCode({ type, payload: {} }), type).toBe("UNKNOWN_MESSAGE_TYPE");
    }
  });

  it("checks the request id before the type, and the type before the payload", () => {
    expect(errorCode({ type: "nope", requestId: 1 })).toBe("INVALID_REQUEST_ID");
    expect(errorCode({ type: "nope" })).toBe("UNKNOWN_MESSAGE_TYPE");
  });

  it("rejects a missing or non-object payload", () => {
    for (const payload of [undefined, null, "x", 3, [], [1]]) {
      expect(errorCode({ type: "setAway", payload }), String(payload)).toBe("INVALID_PAYLOAD");
    }
  });

  it("ignores extra payload fields (they are passed through untouched)", () => {
    expect(parse({ type: "setAway", payload: { away: true, extra: 1 } })).toMatchObject({ payload: { away: true, extra: 1 } });
  });
});

describe("parseClientCommand payload rules", () => {
  const cases: Array<[string, ClientCommand["type"], Record<string, unknown>, string]> = [
    ["channel id is a number", "switchChannel", { channelId: 12 }, "INVALID_CHANNEL_ID"],
    ["channel id is empty", "switchChannel", { channelId: "" }, "INVALID_CHANNEL_ID"],
    ["channel id is not digits", "switchChannel", { channelId: "1a" }, "INVALID_CHANNEL_ID"],
    ["channel id is negative", "switchChannel", { channelId: "-1" }, "INVALID_CHANNEL_ID"],
    ["channel id has 21 digits", "switchChannel", { channelId: "1".repeat(21) }, "INVALID_CHANNEL_ID"],
    ["channel password is a number", "switchChannel", { channelId: "1", password: 1 }, "INVALID_CHANNEL_PASSWORD"],
    ["channel password is over 512", "switchChannel", { channelId: "1", password: "p".repeat(513) }, "INVALID_CHANNEL_PASSWORD"],
    ["move client id is a string", "moveClient", { clientId: "7", channelId: "1" }, "INVALID_CLIENT_ID"],
    ["move client id is zero", "moveClient", { clientId: 0, channelId: "1" }, "INVALID_CLIENT_ID"],
    ["move client id is 65536", "moveClient", { clientId: 65536, channelId: "1" }, "INVALID_CLIENT_ID"],
    ["move client id is fractional", "moveClient", { clientId: 1.5, channelId: "1" }, "INVALID_CLIENT_ID"],
    ["move channel id is bad", "moveClient", { clientId: 7, channelId: "x" }, "INVALID_CHANNEL_ID"],
    ["move password is over 512", "moveClient", { clientId: 7, channelId: "1", password: "p".repeat(513) }, "INVALID_CHANNEL_PASSWORD"],
    ["channel message is a number", "sendTextMessage", { message: 1 }, "INVALID_TEXT_MESSAGE"],
    ["channel message is over 500", "sendTextMessage", { message: "m".repeat(501) }, "INVALID_TEXT_MESSAGE"],
    ["server message is missing", "sendServerMessage", {}, "INVALID_TEXT_MESSAGE"],
    ["private message is over 500", "sendPrivateMessage", { clientId: 7, message: "m".repeat(501) }, "INVALID_TEXT_MESSAGE"],
    ["private message client id is bad", "sendPrivateMessage", { clientId: -1, message: "hi" }, "INVALID_CLIENT_ID"],
    ["poke client id is bad", "poke", { clientId: 0, message: "hi" }, "INVALID_CLIENT_ID"],
    ["poke message is missing", "poke", { clientId: 7 }, "INVALID_POKE_MESSAGE"],
    ["poke message is over 200", "poke", { clientId: 7, message: "m".repeat(201) }, "INVALID_POKE_MESSAGE"],
    ["away is not boolean", "setAway", { away: "yes" }, "INVALID_AWAY_STATUS"],
    ["away message is a number", "setAway", { away: true, message: 1 }, "INVALID_AWAY_STATUS"],
    ["away message is over 200", "setAway", { away: true, message: "m".repeat(201) }, "INVALID_AWAY_STATUS"],
    ["whisper targets is not an array", "setWhisperTargets", { targetIds: "1" }, "INVALID_WHISPER_TARGETS"],
    ["whisper targets has 9 entries", "setWhisperTargets", { targetIds: [1, 2, 3, 4, 5, 6, 7, 8, 9] }, "INVALID_WHISPER_TARGETS"],
    ["whisper targets has a bad id", "setWhisperTargets", { targetIds: [1, 0] }, "INVALID_WHISPER_TARGETS"],
    ["whisper targets has a duplicate", "setWhisperTargets", { targetIds: [1, 1] }, "INVALID_WHISPER_TARGETS"],
    ["whisper active is not boolean", "setWhisperActive", { active: 1 }, "INVALID_WHISPER_STATE"],
    ["muted is not boolean", "setMicrophoneMuted", { muted: "true" }, "INVALID_MICROPHONE_STATE"],
    ["accompaniment active is missing", "setAccompanimentActive", {}, "INVALID_ACCOMPANIMENT_STATE"],
    ["volume is above 4", "setMemberVolume", { clientId: 7, volume: 4.01 }, "INVALID_MEMBER_VOLUME"],
    ["volume is negative", "setMemberVolume", { clientId: 7, volume: -0.1 }, "INVALID_MEMBER_VOLUME"],
    ["volume is a string", "setMemberVolume", { clientId: 7, volume: "1" }, "INVALID_MEMBER_VOLUME"],
    ["volume client id is bad", "setMemberVolume", { clientId: 1.5, volume: 1 }, "INVALID_MEMBER_VOLUME"],
    ["latency sequence is a number", "latencyProbe", { sequence: 1 }, "INVALID_LATENCY_PROBE"],
    ["latency sequence is over 64", "latencyProbe", { sequence: "s".repeat(65) }, "INVALID_LATENCY_PROBE"],
  ];

  it.each(cases)("rejects when the %s", (_name, type, payload, code) => {
    expect(errorCode({ type, payload })).toBe(code);
  });

  it("accepts the exact limits", () => {
    const ok: Array<[ClientCommand["type"], Record<string, unknown>]> = [
      ["switchChannel", { channelId: "1".repeat(20), password: "p".repeat(512) }],
      ["moveClient", { clientId: 65535, channelId: "0", password: "" }],
      ["sendTextMessage", { message: "m".repeat(500) }],
      ["sendTextMessage", { message: "" }],
      ["poke", { clientId: 1, message: "m".repeat(200) }],
      ["setAway", { away: false, message: "m".repeat(200) }],
      ["setWhisperTargets", { targetIds: [] }],
      ["setWhisperTargets", { targetIds: [1, 2, 3, 4, 5, 6, 7, 8] }],
      ["setMemberVolume", { clientId: 1, volume: 0 }],
      ["setMemberVolume", { clientId: 1, volume: 4 }],
      ["latencyProbe", { sequence: "s".repeat(64) }],
    ];
    for (const [type, payload] of ok) expect(errorCode({ type, payload }), `${type} ${JSON.stringify(payload).slice(0, 40)}`).toBeUndefined();
  });

  it("rejects volume that JSON cannot carry as a finite number", () => {
    // JSON.stringify turns NaN and Infinity into null, which is not a number.
    expect(errorCode({ type: "setMemberVolume", payload: { clientId: 7, volume: Number.NaN } })).toBe("INVALID_MEMBER_VOLUME");
    expect(errorCode({ type: "setMemberVolume", payload: { clientId: 7, volume: Number.POSITIVE_INFINITY } })).toBe("INVALID_MEMBER_VOLUME");
  });

  it("does not validate fields of other command types (setAway ignores clientId)", () => {
    expect(errorCode({ type: "setAway", payload: { away: true, clientId: "junk" } })).toBeUndefined();
  });
});

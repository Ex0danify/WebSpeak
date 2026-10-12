// The wire text the gateway sends, pinned row by row (validation, classification, router, uplink). The
// message column is English and for logs only, optional fields ride beside it. Expected text uses escapes
// so the files stay free of CJK characters.
import { describe, expect, it, vi } from "vitest";
import { parseScreenShareMessage } from "../src/modules/screenShare/index.js";
import { handleUplinkFrame } from "../src/modules/voice/audio/audioUplink.js";
import { routeTextFrame } from "../src/modules/voice/messages/voiceMessageRouter.js";
import { parseClientCommand } from "../src/modules/voice/messages/voiceProtocol.js";
import { classifyOperationError, sendProtocolError } from "../src/modules/voice/session/voiceFailures.js";
import type { VoiceConnection } from "../src/modules/voice/voiceTypes.js";

const json = (value: unknown) => JSON.stringify(value);

describe("command validation errors (voiceProtocol)", () => {
  // [what is wrong, raw frame, code, message]
  const rows: [string, string, string, string][] = [
    ["not JSON", "{nope", "INVALID_JSON", "Message is not valid JSON"],
    ["no type", json({}), "INVALID_MESSAGE", "Message type must not be empty"],
    ["request id is not a string", json({ type: "poke", requestId: 1, payload: {} }), "INVALID_REQUEST_ID", "Request id is invalid"],
    ["unknown type", json({ type: "nope", payload: {} }), "UNKNOWN_MESSAGE_TYPE", "Unsupported message type"],
    ["payload is not an object", json({ type: "poke" }), "INVALID_PAYLOAD", "Message payload is invalid"],
    [
      "switchChannel with a bad channel id",
      json({ type: "switchChannel", payload: { channelId: "x" } }),
      "INVALID_CHANNEL_ID",
      "Channel id is invalid",
    ],
    [
      "switchChannel with a bad password",
      json({ type: "switchChannel", payload: { channelId: "1", password: 1 } }),
      "INVALID_CHANNEL_PASSWORD",
      "Channel password is invalid",
    ],
    [
      "moveClient with a bad client id",
      json({ type: "moveClient", payload: { clientId: 0, channelId: "1" } }),
      "INVALID_CLIENT_ID",
      "Member id is invalid",
    ],
    [
      "moveClient with a bad channel id",
      json({ type: "moveClient", payload: { clientId: 1, channelId: "x" } }),
      "INVALID_CHANNEL_ID",
      "Channel id is invalid",
    ],
    [
      "moveClient with a bad password",
      json({ type: "moveClient", payload: { clientId: 1, channelId: "1", password: 1 } }),
      "INVALID_CHANNEL_PASSWORD",
      "Channel password is invalid",
    ],
    [
      "sendTextMessage with a bad text",
      json({ type: "sendTextMessage", payload: { message: 1 } }),
      "INVALID_TEXT_MESSAGE",
      "Text message is invalid",
    ],
    [
      "sendServerMessage with a bad text",
      json({ type: "sendServerMessage", payload: { message: "x".repeat(501) } }),
      "INVALID_TEXT_MESSAGE",
      "Text message is invalid",
    ],
    [
      "sendPrivateMessage with a bad text",
      json({ type: "sendPrivateMessage", payload: { clientId: 1, message: 1 } }),
      "INVALID_TEXT_MESSAGE",
      "Text message is invalid",
    ],
    [
      "sendPrivateMessage with a bad client id",
      json({ type: "sendPrivateMessage", payload: { clientId: 70000, message: "hi" } }),
      "INVALID_CLIENT_ID",
      "Member id is invalid",
    ],
    [
      "poke with a bad client id",
      json({ type: "poke", payload: { clientId: "1", message: "hi" } }),
      "INVALID_CLIENT_ID",
      "Member id is invalid",
    ],
    [
      "poke with a bad message",
      json({ type: "poke", payload: { clientId: 1, message: "x".repeat(201) } }),
      "INVALID_POKE_MESSAGE",
      "Poke message is invalid",
    ],
    ["setAway with a bad flag", json({ type: "setAway", payload: { away: "yes" } }), "INVALID_AWAY_STATUS", "Away status is invalid"],
    [
      "setWhisperTargets with duplicates",
      json({ type: "setWhisperTargets", payload: { targetIds: [1, 1] } }),
      "INVALID_WHISPER_TARGETS",
      "Whisper targets are invalid",
    ],
    [
      "setWhisperActive with a bad flag",
      json({ type: "setWhisperActive", payload: { active: 1 } }),
      "INVALID_WHISPER_STATE",
      "Whisper state is invalid",
    ],
    [
      "setMicrophoneMuted with a bad flag",
      json({ type: "setMicrophoneMuted", payload: { muted: 1 } }),
      "INVALID_MICROPHONE_STATE",
      "Microphone state is invalid",
    ],
    [
      "setAccompanimentActive with a bad flag",
      json({ type: "setAccompanimentActive", payload: { active: 1 } }),
      "INVALID_ACCOMPANIMENT_STATE",
      "Accompaniment state is invalid",
    ],
    [
      "setMemberVolume out of range",
      json({ type: "setMemberVolume", payload: { clientId: 1, volume: 5 } }),
      "INVALID_MEMBER_VOLUME",
      "Member volume is invalid",
    ],
    [
      "latencyProbe with a bad sequence",
      json({ type: "latencyProbe", payload: { sequence: 1 } }),
      "INVALID_LATENCY_PROBE",
      "Latency probe id is invalid",
    ],
  ];

  it.each(rows)("%s", (_what, raw, code, message) => {
    expect(parseClientCommand(raw)).toEqual({ error: { code, message } });
  });
});

describe("screen share validation errors (screenShareProtocol)", () => {
  const rows: [string, Record<string, unknown>, string, string][] = [
    [
      "request id is not a string",
      { type: "screenShareList", requestId: 1 },
      "INVALID_SCREEN_SHARE_REQUEST",
      "Screen share request id is invalid",
    ],
    ["name is empty", { type: "screenShareStart", name: "" }, "INVALID_SCREEN_SHARE_NAME", "Screen share name is invalid"],
    ["audio is not a boolean", { type: "screenShareStart", audio: "yes" }, "INVALID_SCREEN_SHARE_AUDIO", "Share audio option is invalid"],
    ["stop without a stream id", { type: "screenShareStop" }, "INVALID_SCREEN_SHARE_STREAM", "Screen share id is invalid"],
    [
      "signal without a stream id",
      { type: "screenShareSignal", targetPeerId: "p", signal: { kind: "close" } },
      "INVALID_SCREEN_SHARE_STREAM",
      "Screen share id is invalid",
    ],
    [
      "signal without a peer",
      { type: "screenShareSignal", streamId: "s", signal: { kind: "close" } },
      "INVALID_SCREEN_SHARE_PEER",
      "Screen share peer is invalid",
    ],
    [
      "signal of an unknown kind",
      { type: "screenShareSignal", streamId: "s", targetPeerId: "p", signal: { kind: "nope" } },
      "INVALID_SCREEN_SHARE_SIGNAL",
      "Screen share signal is invalid",
    ],
    ["unknown screen share message", { type: "screenShareNope" }, "UNKNOWN_SCREEN_SHARE_MESSAGE", "Unsupported screen share message"],
  ];

  it.each(rows)("%s", (_what, frame, code, message) => {
    expect(parseScreenShareMessage(json(frame))).toEqual({ error: { code, message } });
  });
});

describe("operation errors (classifyOperationError)", () => {
  const classify = (error: unknown) => classifyOperationError(error, "FALLBACK" as never, "fallback message");
  const rows: [string, unknown, string, string][] = [
    ["server id 519", { id: 519 }, "PERMISSION_DENIED", "You do not have permission to do this"],
    ["server id 781", { id: 781 }, "CHANNEL_PASSWORD_REQUIRED", "This channel requires a password"],
    ["server id 515", { id: 515 }, "CHANNEL_FULL", "This channel is full"],
    ["server id 522", { id: 522 }, "CLIENT_VERSION_OUTDATED", "Client version is too old, the server rejected the operation"],
    ["server id 524", { id: 524 }, "FLOOD_PROTECTION", "Too many requests, try again later"],
    ["server id 3329", { id: 3329 }, "BANNED", "You are banned from this server"],
    [
      "server id 1797",
      { id: 1797 },
      "CONNECTION_INITIALISATION_FAILED",
      "TeamSpeak server could not finish connection initialisation, try again later",
    ],
    ["permission text", new Error("insufficient client permissions"), "PERMISSION_DENIED", "You do not have permission to do this"],
    ["invalid channel id", new Error("invalid channelID"), "CHANNEL_NOT_FOUND", "Target channel is unavailable"],
    ["channel password text", new Error("channel password required"), "CHANNEL_PASSWORD_REQUIRED", "This channel requires a password"],
    ["already member", new Error("already member of channel"), "ALREADY_IN_CHANNEL", "You are already in this channel"],
    ["full text", new Error("channel is full"), "CHANNEL_FULL", "This channel is full"],
    ["unknown client", new Error("unknown client"), "CLIENT_NOT_FOUND", "Client is offline or not visible"],
    ["anything else", new Error("something odd"), "FALLBACK", "fallback message"],
  ];

  it.each(rows)("%s", (_what, error, code, message) => {
    expect(classify(error)).toEqual({ code, message });
  });
});

describe("protocol error frame (sendProtocolError)", () => {
  it("is a non-recoverable error frame without a request id", () => {
    const sendJson = vi.fn();
    sendProtocolError(sendJson, "INVALID_JSON", "some message");
    expect(sendJson).toHaveBeenCalledExactlyOnceWith({
      type: "error",
      error: { code: "INVALID_JSON", message: "some message", recoverable: false },
    });
  });
});

describe("router and uplink protocol errors", () => {
  const notReady = () => {
    const sendJson = vi.fn();
    const ctx = { sendJson, state: { tsReady: false }, session: { state: "idle" }, entry: {} } as unknown as VoiceConnection;
    return { ctx, sendJson };
  };
  const OFFER = json({ type: "webrtcOffer", payload: { sdp: { type: "offer", sdp: "v=0" } } });
  const sent = (sendJson: ReturnType<typeof vi.fn>) => sendJson.mock.calls.map((call) => call[0]);
  const error = (code: string, message: string) => ({ type: "error", error: { code, message, recoverable: false } });

  it("WEBRTC_DISABLED", () => {
    const { ctx, sendJson } = notReady();
    routeTextFrame(ctx, OFFER, { getWebRtcOptions: () => undefined, handleScreenShareMessage: vi.fn() });
    expect(sent(sendJson)).toEqual([error("WEBRTC_DISABLED", "WebRTC audio transport is not enabled")]);
  });

  it.each([
    ["an offer", OFFER, { enabled: true }],
    ["a screen share message", json({ type: "screenShareList" }), undefined],
    ["a command", json({ type: "setAway", payload: { away: false } }), undefined],
  ])("SESSION_NOT_READY for %s", (_what, frame, webrtc) => {
    const { ctx, sendJson } = notReady();
    routeTextFrame(ctx, frame, { getWebRtcOptions: () => webrtc as never, handleScreenShareMessage: vi.fn() });
    expect(sent(sendJson)).toEqual([error("SESSION_NOT_READY", "TeamSpeak session is not ready yet")]);
  });

  it("forwards a command parse error and a screen share parse error through the same frame", () => {
    const { ctx, sendJson } = notReady();
    const deps = { getWebRtcOptions: () => undefined, handleScreenShareMessage: vi.fn() };
    routeTextFrame(ctx, "not json", deps);
    routeTextFrame(ctx, json({ type: "screenShareStart", audio: "yes" }), deps);
    expect(sent(sendJson)).toEqual([
      error("INVALID_JSON", "Message is not valid JSON"),
      error("INVALID_SCREEN_SHARE_AUDIO", "Share audio option is invalid"),
    ]);
  });

  it("INVALID_AUDIO_FRAME", () => {
    const sendJson = vi.fn();
    const ctx = {
      sendJson,
      state: { tsReady: true },
      entry: { audio: { ingressDroppedFrames: 0 }, invalidFrameWarnedAt: 0 },
    } as unknown as VoiceConnection;
    handleUplinkFrame(ctx, Buffer.alloc(10));
    expect(sent(sendJson)).toEqual([error("INVALID_AUDIO_FRAME", "Audio frame format is invalid")]);
  });
});

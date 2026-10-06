import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeTeamSpeakServer } from "../../../../test/helpers/fakeTsClient.js";
import { useGateway } from "../../../../test/helpers/gateway.js";
import { ask, errorOf, joinVoice } from "../../../../test/helpers/voice.js";
import type { WsClient } from "../../../../test/helpers/wsClient.js";

const gateways = useGateway();
afterEach(() => vi.restoreAllMocks());

const OFFER = { type: "webrtcOffer", payload: { sdp: { type: "offer", sdp: "v=0" } } };
const WEBRTC_ON = { webRtc: { enabled: true } };

/** Sends a raw text frame and waits for the `error` message it provokes. */
async function errorFor(socket: WsClient, frame: unknown): Promise<{ code: string }> {
  const after = socket.mark();
  socket.sendRaw(typeof frame === "string" ? frame : JSON.stringify(frame));
  return errorOf(await socket.waitForMessage("error", { after }));
}

describe("a text frame goes to the first handler that claims it", () => {
  it("WEBRTC_DISABLED answers an offer when the option is off, with a ready session and without one", async () => {
    const gateway = await gateways.start();
    const alice = await joinVoice(gateway, { nickname: "alice" });
    expect(await errorFor(alice.socket, OFFER)).toMatchObject({ code: "WEBRTC_DISABLED" });

    const release = gateway.ts.holdConnects();
    const early = await gateway.openVoice(gateway.ticket({ nickname: "early" }));
    expect(await errorFor(early, OFFER)).toMatchObject({ code: "WEBRTC_DISABLED" });
    release();
  });

  it("SESSION_NOT_READY answers an offer while TeamSpeak has not connected, when the option is on", async () => {
    const gateway = await gateways.start({ voiceBridgeOptions: WEBRTC_ON });
    const release = gateway.ts.holdConnects();
    const early = await gateway.openVoice(gateway.ticket({ nickname: "early" }));
    expect(await errorFor(early, OFFER)).toMatchObject({ code: "SESSION_NOT_READY" });
    release();
  });

  it("a malformed offer is not an offer: it falls through to the command parser", async () => {
    const gateway = await gateways.start({ voiceBridgeOptions: WEBRTC_ON });
    const alice = await joinVoice(gateway, { nickname: "alice" });
    expect(await errorFor(alice.socket, { type: "webrtcOffer", payload: { sdp: { type: "answer", sdp: "v=0" } } })).toMatchObject({ code: "UNKNOWN_MESSAGE_TYPE" });
  });

  it("webrtcStop is answered with nothing, ready or not, and does not reach the command parser", async () => {
    const gateway = await gateways.start();
    const release = gateway.ts.holdConnects();
    const early = await gateway.openVoice(gateway.ticket({ nickname: "early" }));
    early.send({ type: "webrtcStop" });
    release();
    const alice = await joinVoice(gateway, { nickname: "alice" });
    alice.socket.send({ type: "webrtcStop" });
    await ask(alice, "sendTextMessage", { message: "" });
    expect(alice.socket.messagesOfType("error")).toEqual([]);
    expect(early.messagesOfType("error")).toEqual([]);
  });

  it("a screen-share message is claimed before the command parser, and a malformed one answers its own error even before ready", async () => {
    const gateway = await gateways.start();
    const release = gateway.ts.holdConnects();
    const early = await gateway.openVoice(gateway.ticket({ nickname: "early" }));
    expect(await errorFor(early, { type: "screenShareList" })).toMatchObject({ code: "SESSION_NOT_READY" });
    expect(await errorFor(early, { type: "screenShareStart", audio: "yes" })).toMatchObject({ code: "INVALID_SCREEN_SHARE_AUDIO" });
    release();
  });

  it("a command is validated before readiness: a bad one answers its own error, a good one SESSION_NOT_READY", async () => {
    const gateway = await gateways.start();
    const release = gateway.ts.holdConnects();
    const early = await gateway.openVoice(gateway.ticket({ nickname: "early" }));
    expect(await errorFor(early, "not json")).toMatchObject({ code: "INVALID_JSON" });
    expect(await errorFor(early, { type: "dance" })).toMatchObject({ code: "UNKNOWN_MESSAGE_TYPE" });
    expect(await errorFor(early, { type: "poke", requestId: "r1", payload: { clientId: 1, message: "hi" } })).toMatchObject({ code: "SESSION_NOT_READY" });
    release();
  });

  it("a ready session claims screen share, command and unknown frames in that order without closing the socket", async () => {
    const gateway = await gateways.start({ ts: new FakeTeamSpeakServer() });
    const alice = await joinVoice(gateway, { nickname: "alice" });
    expect(await errorFor(alice.socket, { type: "screenShareJoin" })).toMatchObject({ code: expect.stringMatching(/^INVALID_SCREEN_SHARE/) });
    expect(await errorFor(alice.socket, { type: "dance" })).toMatchObject({ code: "UNKNOWN_MESSAGE_TYPE" });
    expect(alice.socket.closeInfo).toBeNull();
  });
});

// Characterization of the gateway messages that drive the connection state and the roster.
// Each test pins what the composable does, so a change in the router keeps every assertion true.
import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { createVoiceHarness, type VoiceHarness } from "@/testSupport/harness";
import type { FakeWebSocket } from "@/testSupport/fakeWebsocket";

let harness: VoiceHarness;

async function connected(message: Record<string, unknown> = {}): Promise<FakeWebSocket> {
  harness = await createVoiceHarness();
  return harness.joinAndConnect(message);
}

async function push(socket: FakeWebSocket, message: Record<string, unknown>): Promise<void> {
  socket.receive(message);
  await flushPromises();
}

afterEach(() => harness?.dispose());

describe("connected", () => {
  it("marks the session live and records the own client id and roster", async () => {
    harness = await createVoiceHarness();
    harness.voice.session.state.error = "old";
    harness.voice.session.state.errorCode = "OLD";
    const socket = await harness.join();
    socket.receive({
      type: "connected",
      tsClientId: 7,
      members: [
        { id: 7, nickname: "Me" },
        { id: 9, nickname: "Ana", uid: "u9" },
      ],
    });
    const { state } = harness.voice.session;
    const { members } = harness.voice.roster;
    expect(state).toMatchObject({
      connected: true,
      connecting: false,
      reconnecting: false,
      reconnectAttempt: 0,
      reconnectFailed: false,
      tsClientId: 7,
      error: "",
      errorCode: "",
      channelSwitchedChannelId: "",
    });
    expect(members.map((m) => [m.id, m.nickname, m.isSelf])).toEqual([
      [7, "Me", true],
      [9, "Ana", false],
    ]);
  });

  it("replaces the roster and server event log of a previous session", async () => {
    const socket = await connected({ members: [{ id: 1, nickname: "Old" }], serverEventLog: [{ id: "e1" }] });
    await push(socket, {
      type: "connected",
      tsClientId: 7,
      members: [{ id: 2, nickname: "New" }],
      serverEventLog: [{ id: "e2" }, { id: "e3" }],
    });
    expect(harness.voice.roster.members.map((m) => m.id)).toEqual([2]);
    expect(harness.voice.roster.serverEvents.map((e) => e.id)).toEqual(["e2", "e3"]);
  });

  it("keeps the roster when the message carries no members array", async () => {
    const socket = await connected({ members: [{ id: 1, nickname: "Keep" }] });
    await push(socket, { type: "connected", tsClientId: 7 });
    expect(harness.voice.roster.members.map((m) => m.id)).toEqual([1]);
  });

  it("stores a remembered identity of a sane size and ignores an oversized one", async () => {
    const socket = await connected({ identity: "material" });
    expect(harness.voice.session.identityMaterial.value).toBe("material");
    await push(socket, { type: "connected", tsClientId: 7, identity: "x".repeat(8193) });
    expect(harness.voice.session.identityMaterial.value).toBe("material");
  });

  it("applies the initial whisper state, dropping self and invalid ids", async () => {
    await connected({ whisperTargetIds: [7, 3, 0, 70000, 2.5, "4", 5], whisperActive: true });
    expect([...harness.voice.roster.whisperTargetIds]).toEqual([3, 5]);
    expect(harness.voice.roster.whisperActive.value).toBe(true);
  });

  it("does not activate whisper with no targets", async () => {
    await connected({ whisperTargetIds: [], whisperActive: true });
    expect(harness.voice.roster.whisperActive.value).toBe(false);
  });

  it("sends the local mute flag and asks for the screen share list", async () => {
    const socket = await connected();
    expect(socket.sentJson.map((frame) => frame.type)).toEqual(["setMicrophoneMuted", "screenShareList"]);
  });

  it("also sends the deafened flag when output was muted before the connect", async () => {
    harness = await createVoiceHarness();
    harness.voice.audio.outputMuted.value = true;
    const socket = await harness.joinAndConnect();
    expect(socket.sentJson.map((frame) => frame.type)).toEqual(["setMicrophoneMuted", "setOutputMuted", "screenShareList"]);
    expect(socket.sentOfType("setOutputMuted")).toEqual([{ type: "setOutputMuted", payload: { muted: true } }]);
  });

  it("without WebRTC it tries the microphone and records the failure as an audio diagnostic, not a connection error", async () => {
    await connected();
    expect(harness.voice.session.state.connected).toBe(true);
    expect(harness.voice.session.state.error).toBe("");
    expect(harness.voice.session.state.microphoneErrorCode).not.toBe("");
    expect(harness.voice.session.state.audioNoticeCode).toBe("VOICE_FAILED");
  });

  it("negotiates a WebRTC voice peer instead when the gateway advertises WebRTC", async () => {
    const { FakeMediaStream, FakeMediaStreamTrack, FakeRTCPeerConnection } = await import("@/testSupport/browserStubs");
    harness = await createVoiceHarness({ getUserMedia: async () => new FakeMediaStream([new FakeMediaStreamTrack("audio")]) });
    harness.voice.audio.noiseSuppressionEnabled.value = false;
    const socket = await harness.joinAndConnect({ webrtcAvailable: true });
    await flushPromises();
    expect(FakeRTCPeerConnection.instances).toHaveLength(1);
    expect(socket.sentOfType("webrtcOffer")).toMatchObject([
      { payload: { sdp: { type: "offer" }, muted: false, accompanimentActive: false } },
    ]);
    expect(socket.sentBinary).toHaveLength(0);
    expect(harness.voice.session.state.audioNoticeCode).toBe("VOICE_CONNECTING");
    const peer = FakeRTCPeerConnection.instances[0]!;
    peer.connectionState = "connected";
    peer.onconnectionstatechange?.();
    expect(harness.voice.session.state.audioNoticeCode).toBe("");
  });

  it("clears the connecting notice once the PCM microphone is running", async () => {
    const { FakeMediaStream, FakeMediaStreamTrack } = await import("@/testSupport/browserStubs");
    harness = await createVoiceHarness({ getUserMedia: async () => new FakeMediaStream([new FakeMediaStreamTrack("audio")]) });
    harness.voice.audio.noiseSuppressionEnabled.value = false;
    await harness.joinAndConnect();
    await flushPromises();
    expect(harness.voice.session.state.audioNoticeCode).toBe("");
  });
});

describe("memberEnter / memberLeave / memberAvatar", () => {
  it("adds a member once and ignores a repeated id", async () => {
    const socket = await connected();
    await push(socket, { type: "memberEnter", id: 9, nickname: "Ana", uid: "u9", avatar: "data:a", isSelf: false });
    await push(socket, { type: "memberEnter", id: 9, nickname: "Again" });
    expect(harness.voice.roster.members).toMatchObject([{ id: 9, nickname: "Ana", uid: "u9", avatar: "data:a", isSelf: false }]);
  });

  it("drops non-string uid/avatar and coerces isSelf to a boolean", async () => {
    const socket = await connected();
    await push(socket, { type: "memberEnter", id: 9, nickname: "Ana", uid: 5, avatar: {}, isSelf: 1 });
    expect(harness.voice.roster.members[0]).toEqual({ id: 9, nickname: "Ana", uid: undefined, avatar: undefined, isSelf: true });
  });

  it("removes a leaving member and clears their speaking state", async () => {
    const socket = await connected({ members: [{ id: 9, nickname: "Ana" }] });
    await push(socket, { type: "voiceActivity", clientIds: [9] });
    expect(harness.voice.roster.speakingIds.has(9)).toBe(true);
    await push(socket, { type: "memberLeave", id: 9 });
    expect(harness.voice.roster.members.some((m) => m.id === 9)).toBe(false);
    expect(harness.voice.roster.speakingIds.has(9)).toBe(false);
  });

  it("ignores a leave for an unknown member", async () => {
    const socket = await connected({ members: [{ id: 9, nickname: "Ana" }] });
    await push(socket, { type: "memberLeave", id: 99 });
    expect(harness.voice.roster.members).toHaveLength(1);
  });

  it("updates the avatar in the roster and in every channel copy, matching uid when given", async () => {
    const socket = await connected({ members: [{ id: 9, nickname: "Ana", uid: "u9" }] });
    await push(socket, {
      type: "channelList",
      channels: [
        {
          id: "1",
          name: "Lobby",
          members: [
            { id: 9, nickname: "Ana", uid: "u9" },
            { id: 8, nickname: "Ben", uid: "u8" },
          ],
        },
      ],
    });
    await push(socket, { type: "memberAvatar", id: 9, uid: "u9", avatar: "data:new" });
    expect(harness.voice.roster.members[0].avatar).toBe("data:new");
    expect(harness.voice.roster.channels[0].members?.find((m) => m.id === 9)?.avatar).toBe("data:new");
    expect(harness.voice.roster.channels[0].members?.find((m) => m.id === 8)?.avatar).toBeUndefined();
    await push(socket, { type: "memberAvatar", id: 9, uid: "someone-else", avatar: "data:other" });
    expect(harness.voice.roster.members[0].avatar).toBe("data:new");
    await push(socket, { type: "memberAvatar", id: 9, uid: "u9" });
    expect(harness.voice.roster.members[0].avatar).toBeUndefined();
  });
});

describe("channelList", () => {
  it("replaces the channel list and tolerates a missing array", async () => {
    const socket = await connected();
    await push(socket, {
      type: "channelList",
      channels: [
        { id: "1", name: "A" },
        { id: "2", name: "B" },
      ],
    });
    expect(harness.voice.roster.channels.map((c) => c.id)).toEqual(["1", "2"]);
    await push(socket, { type: "channelList", channels: [{ id: "3", name: "C" }] });
    expect(harness.voice.roster.channels.map((c) => c.id)).toEqual(["3"]);
    await push(socket, { type: "channelList" });
    expect(harness.voice.roster.channels).toHaveLength(0);
  });
});

describe("channelSwitched", () => {
  it("records the channel id as a string and clears any error", async () => {
    const socket = await connected();
    harness.voice.session.state.error = "boom";
    harness.voice.session.state.errorCode = "X";
    await push(socket, { type: "channelSwitched", channelId: 12 });
    expect(harness.voice.session.state).toMatchObject({ channelSwitchedChannelId: "12", error: "", errorCode: "" });
    await push(socket, { type: "channelSwitched", channelId: null });
    expect(harness.voice.session.state.channelSwitchedChannelId).toBe("");
  });
});

describe("disconnected / reconnecting / reconnected / reconnectFailed / connectionFailed", () => {
  it("disconnected is a recoverable reconnect unless the gateway says otherwise", async () => {
    const socket = await connected();
    await push(socket, { type: "disconnected" });
    expect(harness.voice.session.state).toMatchObject({
      connected: false,
      connecting: false,
      reconnecting: true,
      reconnectFailed: false,
      error: "",
    });
  });

  it("disconnected with recoverable:false raises the disconnect error", async () => {
    const socket = await connected();
    await push(socket, { type: "disconnected", recoverable: false });
    expect(harness.voice.session.state).toMatchObject({
      connected: false,
      reconnecting: false,
      error: { key: "connectionClosedTeamSpeak" },
    });
  });

  it("disconnected clears the whisper state", async () => {
    const socket = await connected({ whisperTargetIds: [3], whisperActive: true });
    await push(socket, { type: "disconnected" });
    expect(harness.voice.roster.whisperTargetIds.size).toBe(0);
    expect(harness.voice.roster.whisperActive.value).toBe(false);
  });

  it("reconnecting uses the given attempt number, else counts up from the previous one", async () => {
    const socket = await connected();
    await push(socket, { type: "reconnecting", attempt: 3 });
    expect(harness.voice.session.state).toMatchObject({ connected: false, reconnecting: true, reconnectAttempt: 3 });
    await push(socket, { type: "reconnecting" });
    expect(harness.voice.session.state.reconnectAttempt).toBe(4);
  });

  it("reconnected only clears the reconnecting and failed flags", async () => {
    const socket = await connected();
    await push(socket, { type: "reconnecting", attempt: 2 });
    await push(socket, { type: "reconnected" });
    expect(harness.voice.session.state).toMatchObject({ reconnecting: false, reconnectFailed: false, reconnectAttempt: 2 });
  });

  it("a `connected` after reconnecting resumes audio and resets the attempt counter", async () => {
    const socket = await connected();
    await push(socket, { type: "reconnecting", attempt: 2 });
    await push(socket, { type: "connected", tsClientId: 7, members: [] });
    expect(harness.voice.session.state).toMatchObject({ connected: true, reconnecting: false, reconnectAttempt: 0 });
  });

  it("reconnectFailed sets the failed flag with a mapped error", async () => {
    const socket = await connected();
    await push(socket, { type: "reconnectFailed", code: "SERVER_REJECTED" });
    expect(harness.voice.session.state).toMatchObject({
      connected: false,
      connecting: false,
      reconnecting: false,
      reconnectFailed: true,
      errorCode: "SERVER_REJECTED",
    });
    expect(harness.voice.session.state.error).not.toBe("");
  });

  it("connectionFailed is a first-attempt failure: not reconnectFailed, and the following close stays silent", async () => {
    harness = await createVoiceHarness();
    const socket = await harness.join();
    await push(socket, { type: "connectionFailed", code: "IDENTITY_IN_USE" });
    expect(harness.voice.session.state).toMatchObject({
      connected: false,
      connecting: false,
      reconnecting: false,
      reconnectFailed: false,
      errorCode: "IDENTITY_IN_USE",
    });
    harness.voice.session.clearError();
    socket.serverClose(4004, "");
    expect(harness.voice.session.state.errorCode).toBe("");
    expect(harness.voice.session.state.error).toBe("");
  });

  it("without a prior connectionFailed, a non-1000 close raises the code-derived error", async () => {
    const socket = await connected();
    socket.serverClose(4004, "");
    expect(harness.voice.session.state).toMatchObject({
      connected: false,
      errorCode: "SERVER_REJECTED",
      error: { key: "closeServerFullOrRejected" },
    });
  });

  it("a plain close (1000) stays silent, but admin-terminated does not", async () => {
    const socket = await connected();
    socket.serverClose(1000, "");
    expect(harness.voice.session.state.error).toBe("");
    harness.dispose();
    const second = await connected();
    second.serverClose(1000, "admin-terminated");
    expect(harness.voice.session.state.error).not.toBe("");
  });
});

describe("error", () => {
  it("maps the protocol error code and message into state", async () => {
    const socket = await connected();
    await push(socket, { type: "error", error: { code: "CHANNEL_FULL", message: "full" } });
    expect(harness.voice.session.state.errorCode).toBe("CHANNEL_FULL");
    expect(harness.voice.session.state.error).not.toBe("");
  });

  it("falls back to OPERATION_FAILED and a generic message", async () => {
    const socket = await connected();
    await push(socket, { type: "error" });
    expect(harness.voice.session.state.errorCode).toBe("OPERATION_FAILED");
    expect(harness.voice.session.state.error).not.toBe("");
  });
});

describe("frame handling", () => {
  it("ignores unknown message types", async () => {
    const socket = await connected();
    const before = JSON.stringify(harness.voice.session.state);
    await push(socket, { type: "somethingNew", id: 1 });
    expect(JSON.stringify(harness.voice.session.state)).toBe(before);
    expect(harness.voice.roster.members).toHaveLength(0);
  });

  it("ignores malformed JSON text frames without throwing", async () => {
    const socket = await connected();
    socket.receiveText("{not json");
    expect(harness.voice.session.state.connected).toBe(true);
  });

  it("ignores frames from an outdated connection", async () => {
    harness = await createVoiceHarness();
    const first = await harness.join();
    await harness.join();
    first.serverClose(1006, "");
    expect(harness.voice.session.state.errorCode).toBe("");
  });
});
